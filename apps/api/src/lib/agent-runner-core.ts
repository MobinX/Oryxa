import type { AgentRunResult, SseEmitter, TokenUsageMetrics } from '@repo/agent';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { currentContext, tagContext } from '@api/lib/ctx';
import { agentInputFields, createAgentTrace, tokenFields } from '@api/lib/agent-trace';
import { RUN_LOOP_DEPTH_THRESHOLD, STALE_RUNNER_MS } from '@api/lib/config';
import { refundQuotaUnit, spendQuotaUnit } from '@repo/db/crud/billing';
import { parseConversationAgentState, stripEmDashes } from '@repo/shared';
import { INSTAGRAM_AGENT_GUIDANCE } from '@repo/agent';

/**
 * How many of the customer's turns a picture stays pixels for. Counted in turns rather than raw
 * rows, because the agent's own answers are rows too — a single reply that went out as three
 * messages used to push a one-turn-old photo out of a rows-based window on its own.
 *
 * Each one costs roughly a thousand tokens and is re-sent on every reply, so the window is a
 * trade: wide enough that a photo and the question about it survive arriving as two deliveries
 * and a few exchanges, narrow enough that a long thread does not pay for its whole photo album.
 */
const PHOTO_MEMORY_TURNS = 6;

export interface AgentRunOptions {
  /**
   * If provided, structured debug events are streamed to the caller (the test
   * webhook uses this). The core always records its own copy of the tool trace,
   * so this is purely additive.
   */
  emitSse?: SseEmitter;
  /**
   * Override the Facebook sendMessage function. When set, no real HTTP call
   * is made to the Meta Send API. The test webhook uses this to emit an SSE
   * `message_sent` event instead of calling Facebook.
   */
  sendMessageOverride?: (pageToken: string, psid: string, text: string) => Promise<void>;
}

/**
 * Core agent execution logic. Loads the conversation, claims the lock,
 * builds history + catalog context, runs the LangGraph agent, persists the
 * reply, and triggers a follow-up run if more pending messages arrived
 * while the agent was processing.
 *
 * This is the single implementation shared by every transport:
 *   - Facebook Messenger: `runAgentForConversation` calls this with no opts
 *   - Test webhook: `POST /internal/test-run` calls this with emitSse + sendMessageOverride
 *   - Future transports (Instagram, WhatsApp, …): same pattern
 */
export async function runAgentCore(
  conversationId: string,
  opts: AgentRunOptions = {},
): Promise<AgentRunResult | undefined> {
  // The caller's emitter (test webhook SSE) keeps receiving every event; the
  // trace adapter adds the logged copy of the tool calls.
  const trace = createAgentTrace(opts.emitSse);
  const emitSse = trace.emitSse;
  const { sendMessageOverride } = opts;

  const {
    getConversationWithHistory,
    updateConversationState,
    updateConversationAgentState,
    createMessage,
    claimConversationForAgentRun,
    markMessagesDoneByIds,
    listPendingCustomerMessages,
  } = await import('@repo/db/crud/conversation');
  const { Agent } = await import('@repo/agent');
  const { buildCatalogSummary } = await import('./catalog-summary');
  const { sendMessage, senderAction } = await import('@repo/integrations/facebook');
  const { resolveAnsweringAgent } = await import('@repo/db/crud/default-agent');

  const conv = await getConversationWithHistory(conversationId);
  if (!conv?.channel) {
    console.log(`[agent-runner-core] no channel on conversation ${conversationId} — skipping`);
    // The channel carries the Page token a reply is sent with, so without one nothing can answer —
    // a silence with no error anywhere in the system. A channel holding no agent of its own is no
    // longer part of that silence: it answers with the platform default.
    emitAnomaly('channel_without_agent', { detail: conversationId });
    return;
  }

  const answering = await resolveAnsweringAgent(conv.channel.agent);
  const platform: 'facebook' | 'instagram' | 'whatsapp' =
    conv.channel.platform === 'instagram' ? 'instagram' : conv.channel.platform === 'whatsapp' ? 'whatsapp' : 'facebook';

  // AI Studio gate (spec B) runs before anything is claimed: a channel switched off, or a
  // conversation paused for human takeover (spec E), never answers and never burns a run.
  // "AI NEVER replies after human takeover" is exactly this one check.
  const { buildAiContext } = await import('@api/lib/ai-context');
  const aiContext = await buildAiContext({
    channelId: conv.channel.id,
    businessId: conv.businessId,
    leadId: conv.id,
  });
  if (!aiContext.config.aiEnabled || (conv as { aiPaused?: boolean }).aiPaused) {
    const reason = (conv as { aiPaused?: boolean }).aiPaused ? 'ai_paused' : 'ai_off';
    console.log(
      `[agent-runner-core] AI disabled for conversation ${conversationId} (${reason}) — leaving unanswered for human`,
    );
    emitAnomaly('ai_disabled', { detail: `${conversationId}:${reason}` });
    return;
  }


  // Atomic claim: only one concurrent caller transitions idle→working and gets
  // to run the agent. This is the single race-free gate that prevents duplicate
  // runs when overlapping webhooks or the tail re-trigger fire at the same time.
  // A lock older than the stale threshold is claimable too — the runner that set
  // it is gone, and without that the conversation would stay locked unheld.
  const claimed = await claimConversationForAgentRun(
    conv.id,
    new Date(Date.now() - STALE_RUNNER_MS),
  );
  if (!claimed) {
    console.log(`[agent-runner-core] conversation ${conversationId} already working — skipping duplicate`);
    // Message-lock contention: another runner owns this conversation, so this
    // caller did nothing and the backlog waits for whichever run holds the lock.
    emitAnomaly('claim_lost');
    return;
  }

  console.log(`[agent-runner-core] claimed conversation ${conversationId} — starting agent run`);

  tagContext({ conversationId: conv.id, businessId: conv.businessId, channelId: conv.channelId });
  const runDepth = currentContext()?.runDepth ?? 0;
  if (runDepth >= RUN_LOOP_DEPTH_THRESHOLD) {
    emitAnomaly('run_loop_depth', { count: runDepth });
  }

  if (!sendMessageOverride && platform !== 'whatsapp') {
    await senderAction(conv.channel.apiToken, conv.customerPlatformId, 'typing_on');
  }
  emitSse('runner_start', { conversationId });

  // Drain the ENTIRE backlog in this run: snapshot every pending customer
  // message (oldest first, no cap) so the agent replies to all of them in order
  // instead of only the most recent 10 and leaving older ones for a later,
  // out-of-order follow-up run.
  const pendingMsgs = await listPendingCustomerMessages(conv.id);
  const repliedMessageIds = pendingMsgs.map((m) => m.id);
  console.log(`[agent-runner-core] pending messages in backlog: ${pendingMsgs.length}`);

  // Build the agent's history: all pending customer messages (the backlog,
  // chronological) merged with the recent context from the last 10 loaded
  // messages (which carries the bot's recent replies), deduped by id and
  // sorted oldest→newest.
  const historyById = new Map(conv.messages.map((m) => [m.id, m]));
  for (const m of pendingMsgs) historyById.set(m.id, m);
  const pendingIds = new Set(repliedMessageIds);
  const orderedHistory = [...historyById.values()]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // A picture stays pixels until six of the customer's turns have passed after it, not only for
  // the ones being answered this second. "Do you have this?" and the photo it belongs to routinely
  // land as two deliveries a second apart, and the question that matters rarely arrives in the
  // same turn as the picture. Anything older than that window is the note in `Agent.ts` — the
  // model still knows a picture was sent, and stops asking for it. Counted from the newest message
  // backwards: an image's age is how many customer turns came after it, whatever the agent's own
  // replies did to the row count in between.
  const pixelsWanted = new Set<string>();
  let customerTurnsSeen = 0;
  for (let i = orderedHistory.length - 1; i >= 0; i--) {
    const m = orderedHistory[i]!;
    if (m.from !== 'customer') continue;
    if (m.imageKeys.length > 0 && customerTurnsSeen < PHOTO_MEMORY_TURNS) pixelsWanted.add(m.id);
    customerTurnsSeen += 1;
  }
  const history = orderedHistory.map((m) => {
    const asPixels = pendingIds.has(m.id) || pixelsWanted.has(m.id);
    return {
      from: m.from,
      content: m.content,
      imageKeys: asPixels ? m.imageKeys : [],
      hadImages: !asPixels && m.imageKeys.length > 0,
    };
  });

  const agentState = parseConversationAgentState(conv.agentState);
  const latestCustomerText = [...pendingMsgs].reverse().find((m) => m.content.trim())?.content ?? '';

  // A chip row is dismissed by a tap, but not by a typed answer. If the customer ignored the
  // last row by typing, this turn writes the choices into the message instead of attaching a
  // second row under the first one.
  const normalizeSuggestion = (value: string): string =>
    value.trim().toLowerCase().replace(/\s+/g, ' ');
  let suppressSuggestions = false;
  if (pendingMsgs.length > 0 && (agentState.lastSuggestions ?? []).length > 0) {
    const offered = agentState.lastSuggestions ?? [];
    const tapped = pendingMsgs.some(
      (message) =>
        message.contentType === 'quick_reply' ||
        message.contentType === 'postback' ||
        offered.some(
          (option) => normalizeSuggestion(option) === normalizeSuggestion(message.content),
        ),
    );
    agentState.lastSuggestions = [];
    if (!tapped) {
      suppressSuggestions = true;
      console.log(
        '[agent-runner-core] customer typed instead of tapping the suggestions — no new chip row this turn',
      );
    }
  }
  const orderTap = latestCustomerText.match(/^place order with ([\da-f-]{36}) and (.*?)(?: variant ([\da-f-]{36}))?$/i);

  const [productFromTap, latestOrderRes, catalog] = await Promise.all([
    orderTap
      ? import('@repo/db/crud/product').then(({ getProductById }) => getProductById(conv.businessId, orderTap[1]).catch(() => null))
      : Promise.resolve(null),
    !agentState.lastOrder
      ? import('@repo/db/crud/order').then(({ getOrdersByPlatformId }) => getOrdersByPlatformId(conv.businessId, conv.customerPlatformId, { limit: 1 }).catch(() => ({ orders: [] })))
      : Promise.resolve(null),
    buildCatalogSummary(conv.businessId),
  ]);

  if (productFromTap) {
    agentState.currentProduct = { id: productFromTap.id, name: productFromTap.name, price: String(productFromTap.price) };
    agentState.pendingOrder = {
      ...agentState.pendingOrder,
      productId: productFromTap.id,
      productName: productFromTap.name,
      ...(orderTap?.[3] ? { variantId: orderTap[3] } : {}),
    };
  }

  const phone = latestCustomerText.match(/(?:\+?88)?01[3-9]\d{8}/)?.[0];
  if (phone) {
    agentState.pendingOrder = {
      ...agentState.pendingOrder,
      customerPhone: phone,
    };
  }
  if (/\b(?:don't like|do not like|not this|another|different|doesn't suit|does not suit)\b|পছন্দ না|ভালো লাগছে না|হবে না|অন্য (?:রং|কালার|সাইজ)/i.test(latestCustomerText)) {
    const customerText = latestCustomerText.normalize('NFKC').toLocaleLowerCase();
    for (const variant of agentState.shownVariants) {
      const terms = variant.name.split(/[\s/-]+/).map((part) => part.trim()).filter((part) => part.length > 1);
      for (const term of terms) {
        if (!customerText.includes(term.toLocaleLowerCase())) continue;
        if (/^(?:xs|s|m|l|xl|xxl|xxxl|\d+)$/i.test(term)) {
          if (!agentState.rejectedSizes.includes(term)) agentState.rejectedSizes.push(term);
        } else if (!agentState.rejectedColors.includes(term)) {
          agentState.rejectedColors.push(term);
        }
      }
    }
  }

  if (latestOrderRes && latestOrderRes.orders.length > 0) {
    const latest = latestOrderRes.orders[0];
    const stateWords = { pending: 'Pending', acknowledged: 'Acknowledged', on_delivery: 'On delivery', done: 'Done' } as const;
    agentState.lastOrder = {
      id: latest.id,
      productId: latest.productId,
      productName: latest.productName ?? 'Order',
      variantId: latest.variantId,
      variantName: latest.variantName,
      count: latest.count,
      totalPrice: latest.totalPrice.toFixed(2),
      state: stateWords[latest.state as keyof typeof stateWords] ?? 'Pending',
      createdAt: latest.createdAt.toISOString(),
    };
  }

  console.log(`[agent-runner-core] history compiled — ${history.length} messages (${pendingMsgs.length} pending, ${conv.messages.length} from context)`);
  console.log(`[agent-runner-core] catalog loaded — ${catalog.total} products`);
  const catalogSummary = catalog.summary;

  // Everything the model is about to see, before it decides anything.
  emit('agent_input', agentInputFields({ history, catalogCount: catalog.total, systemPrompt: answering.systemPrompt }));

  // Resolve the real sendMessage function here; the override (if any) is injected into
  // the Agent so the same path is exercised whether or not we are in test mode. The raw
  // value goes to the tools, not the resolved one: a tool reads "override present" as
  // "nothing reaches the wire", which is how the message budget knows not to charge.
  // WhatsApp answers through the Cloud API with the phone number the channel stores as
  // its platform id — the Messenger/Instagram Graph send would not understand this token.
  const { sendWhatsAppText } = await import('@repo/integrations/whatsapp');
  const realSend = async (token: string, psid: string, text: string) => {
    if (platform === 'whatsapp' && conv.channel.platformChannelId) {
      await sendWhatsAppText(token, conv.channel.platformChannelId, psid, text);
      return;
    }
    if (platform === 'instagram' || platform === 'facebook') {
      await sendMessage(token, psid, text, { platform });
      return;
    }
    throw new Error(`no send path configured for platform ${platform}`);
  };
  const resolvedSendMessage = sendMessageOverride ?? realSend;

  const agent = new Agent({
    systemPrompt: answering.systemPrompt,
    business: conv.business ?? { id: conv.businessId, name: 'Store' },
    history,
    conversationId: conv.id,
    pageToken: conv.channel.apiToken,
    customerPlatformId: conv.customerPlatformId,
    customerName: conv.customerName,
    catalogSummary,
    emitSse,
    sendMessageOverride,
    platform,
    suppressSuggestions,
    // Already resolved: the store's own block, else the platform default's, else the channel's
    // reviewed text in @agent/guidance.
    replyGuidance:
      answering.replyGuidance ??
      (platform === 'instagram' ? INSTAGRAM_AGENT_GUIDANCE : undefined),
    agentState,
    persistAgentState: (state) => updateConversationAgentState(conv.id, state),
    onOrderCreated: async (orderId) => {
      const { getOrderById } = await import('@repo/db/crud/order');
      const order = await getOrderById(conv.businessId, orderId);
      if (!order?.productId) return;
      const stateWords = { pending: 'Pending', acknowledged: 'Acknowledged', on_delivery: 'On delivery', done: 'Done' } as const;
      agentState.currentProduct = { id: order.productId, name: order.productName ?? 'Order', price: order.variantPrice.toFixed(2) };
      agentState.currentVariant = order.variantId
        ? { id: order.variantId, name: order.variantName ?? '', price: order.variantPrice.toFixed(2) }
        : null;
      agentState.pendingOrder = null;
      agentState.lastOrder = {
        id: order.id,
        productId: order.productId,
        productName: order.productName ?? 'Order',
        variantId: order.variantId,
        variantName: order.variantName,
        count: order.count,
        totalPrice: order.totalPrice.toFixed(2),
        state: stateWords[order.state as keyof typeof stateWords] ?? 'Pending',
        createdAt: order.createdAt.toISOString(),
      };
      await updateConversationAgentState(conv.id, agentState);
    },
  });

  const started = performance.now();
  let ok = false;
  let replyText = '';
  let metrics: TokenUsageMetrics | undefined;
  let run: AgentRunResult | undefined;
  let sentViaFallback = 0;
  let clearedCount = 0;
  let stateSetTo = 'working';
  let runError: unknown;

  try {
    run = await agent.run();
    replyText = run.replyText;
    metrics = run.metrics;

    // Log token metrics for this Messenger conversation turn
    try {
      const { recordTokenUsage } = await import('@repo/db/crud/token-analytics');
      await recordTokenUsage({
        businessId: conv.businessId,
        channelId: conv.channelId,
        conversationId: conv.id,
        integrationType: platform === 'instagram' ? 'instagram_messenger' : 'facebook_messenger',
        provider: metrics.provider,
        model: metrics.model,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalTokens: metrics.totalTokens,
        cacheHitTokens: metrics.cacheHitTokens,
        cacheMissTokens: metrics.cacheMissTokens,
        cacheHitPercent: metrics.cacheHitPercent,
        latencyMs: metrics.latencyMs,
        estimatedCostUsd: metrics.estimatedCostUsd,
      });
    } catch (metricErr) {
      console.error('[agent-runner-core] failed to record token metrics:', metricErr);
      // The reply still went out; the usage row did not, so this turn is
      // invisible to quota and the customer's allowance silently grows.
      emitAnomaly('token_metrics_unrecorded', { detail: metricErr });
      emit('error', errorFields(metricErr), { dedupe: null });
    }

    // Strip em-dashes and ensure clean reply text
    if (replyText) {
      replyText = stripEmDashes(replyText);
    }

    // Persist conversation agent state once at the end of the turn
    await updateConversationAgentState(conv.id, agentState).catch((err) => {
      console.error('[agent-runner-core] failed to persist agentState at turn end:', err);
    });

    // The model's final text is delivered here. Product and order cards sent during tool calls do
    // not replace that text; an empty or SILENT response produces no text message.
    if (replyText && replyText.trim() !== 'SILENT') {
      console.log(`[agent-runner-core] sending the model's final text (${agent.sentTexts.length} other send(s) during tool calls)`);

      // The same charge as the tool path, because this is a reply the customer receives:
      // the tool simply never ran. A test override puts nothing on the wire and pays
      // nothing; SILENT is not a reply and pays nothing, though it is still sent as it
      // always has been.
      const chargeable = !sendMessageOverride && replyText.trim() !== 'SILENT';
      let chargedPeriod: string | null = null;
      let allowed = true;
      if (chargeable) {
        try {
          const budget = await spendQuotaUnit(conv.businessId, 'message');
          if (budget.spent) chargedPeriod = budget.period;
          else allowed = false;
        } catch (err) {
          // Fails open like the gate: the reply goes out uncharged rather than muted.
          console.error('[agent-runner-core] quota spend failed, sending uncharged:', err);
        }
      }

      if (!allowed) {
        console.log(`[agent-runner-core] fallback not sent — the message allowance is used up`);
        emitAnomaly('quota_exhausted', { detail: conv.businessId });
      } else {
        emitSse('message_sent', { text: replyText, fallback: true });
        try {
          // The test override still receives exactly the three arguments it always did; a real
          // send learns the platform so Instagram gets its 1,000-character chunks and
          // WhatsApp its 4,096-character Cloud API messages.
          await resolvedSendMessage(conv.channel.apiToken, conv.customerPlatformId, replyText);
        } catch (err) {
          if (chargedPeriod) {
            try {
              await refundQuotaUnit(conv.businessId, 'message', chargedPeriod);
            } catch (refundErr) {
              console.error('[agent-runner-core] quota refund failed:', refundErr);
            }
          }
          throw err;
        }
        await createMessage({
          conversationId: conv.id,
          from: 'self',
          sentBy: 'ai',
          content: replyText,
          state: 'done',
        });
        sentViaFallback = 1;
      }
    }

    // Clear only the messages the agent actually replied to; anything that
    // arrived during the run remains pending and triggers a follow-up run.
    await markMessagesDoneByIds(conv.id, repliedMessageIds);
    clearedCount = repliedMessageIds.length;
    await updateConversationState(conv.id, 'done');
    stateSetTo = 'done';
    console.log(`[agent-runner-core] conversation ${conversationId} state → done`);
    emitSse('runner_done', { conversationId, metrics });
    ok = true;
  } catch (err) {
    console.error('[agent-runner-core] agent run failed:', err);
    emit('error', errorFields(err), { dedupe: null });
    emitSse('runner_error', { conversationId, error: String(err) });
    // Pre-existing behaviour: a failed run releases the lock as `done` rather
    // than `error`, so a later webhook can pick the conversation up again. The
    // messages stay pending, but the state never says this run broke.
    await updateConversationState(conv.id, 'done');
    stateSetTo = 'done';
    runError = err;
  }

  const sentViaTool = agent.sentTexts.length;
  if (runError && stateSetTo === 'done') {
    // The run broke, yet the conversation is `done` like any other: nothing in
    // the data says this turn failed, so only the log can tell the story.
    emitAnomaly('error_state_done');
  }
  const unresolved = trace.unresolved();
  if (unresolved) {
    // A tool that reported a call but no result threw inside it — for
    // a Messenger delivery that is either the Graph send or the history write failing,
    // and LangGraph feeds the error back to the model as a tool message.
    emitAnomaly('tool_call_unresolved', { detail: unresolved });
  }
  if (ok && clearedCount > 0 && sentViaTool + sentViaFallback === 0) {
    // The defect the 200 response hides: the backlog was marked answered after
    // nothing was sent, so no later run will ever reply to these messages.
    emitAnomaly('backlog_claimed_but_unanswered', { count: clearedCount });
  }

  // Re-trigger only for a message this run never had the chance to answer — one
  // that arrived while the agent was working. After a failed run the same backlog
  // is still pending, and handing it to a fresh run repeats the identical failure
  // as many times as there are fresh runs: three LLM calls, three rejected sends,
  // and no reply either time.
  const leftover = await listPendingCustomerMessages(conv.id);
  const hasPending = leftover.some((message) => !repliedMessageIds.includes(message.id));

  // One outcome event per run, carrying what the runner used to narrate: the
  // claim, the backlog, the reply, the sends, the state and the token spend.
  emit('agent_run', {
    ok,
    pendingClaimed: repliedMessageIds.length,
    repliedCount: clearedCount,
    sentViaTool,
    sentViaFallback,
    fallbackUsed: sentViaFallback > 0,
    stateSetTo,
    toolCallCount: trace.toolCallCount(),
    replyText,
    ...tokenFields(metrics),
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    // Whether this run handed the conversation on to another one.
    reTriggered: hasPending,
  });

  if (hasPending) {
    console.log(`[agent-runner-core] found more pending messages — re-triggering`);
    // Re-trigger via HTTP so the new run is handled by the same routing
    // (background on Bun, waitUntil on Vercel). Import lazily to keep this
    // module free of circular deps.
    const { triggerAgentRun } = await import('@api/lib/agent-runner');
    // No `quota` here on purpose: this run has just spent part of the allowance, so the
    // next one is gated on a fresh read rather than on whatever was known when it started.
    await triggerAgentRun(conversationId, { businessId: conv.businessId });
  }

  // Undefined on a failed run: the caller streaming a playground gets the error event instead of
  // a trace of a turn that never finished.
  return run;
}
