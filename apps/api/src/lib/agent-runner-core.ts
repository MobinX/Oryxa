import type { SseEmitter, TokenUsageMetrics } from '@repo/agent';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { currentContext, tagContext } from '@api/lib/ctx';
import { agentInputFields, createAgentTrace, tokenFields } from '@api/lib/agent-trace';
import { RUN_LOOP_DEPTH_THRESHOLD, STALE_RUNNER_MS } from '@api/lib/config';

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
): Promise<void> {
  // The caller's emitter (test webhook SSE) keeps receiving every event; the
  // trace adapter adds the logged copy of the tool calls.
  const trace = createAgentTrace(opts.emitSse);
  const emitSse = trace.emitSse;
  const { sendMessageOverride } = opts;

  const {
    getConversationWithHistory,
    updateConversationState,
    createMessage,
    checkPendingMessages,
    claimConversationForAgentRun,
    markMessagesDoneByIds,
    listPendingCustomerMessages,
  } = await import('@repo/db/crud/conversation');
  const { Agent } = await import('@repo/agent');
  const { listProducts } = await import('@repo/db/crud/product');
  const { sendMessage, senderAction } = await import('@repo/integrations/facebook');

  const conv = await getConversationWithHistory(conversationId);
  if (!conv?.channel?.agent) {
    console.log(`[agent-runner-core] no agent on conversation ${conversationId} — skipping`);
    // Nothing can reply to this customer until an agent is attached to the
    // channel — a silence with no error anywhere in the system.
    emitAnomaly('channel_without_agent', { detail: conversationId });
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

  if (!sendMessageOverride) {
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
  const history = [...historyById.values()]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .map((m) => ({ from: m.from, content: m.content }));

  const catalog = await listProducts(conv.businessId, { limit: 10 });
  console.log(`[agent-runner-core] history compiled — ${history.length} messages (${pendingMsgs.length} pending, ${conv.messages.length} from context)`);
  console.log(`[agent-runner-core] catalog loaded — ${catalog.products.length} products`);
  const catalogSummary = catalog.products
    .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
    .join('\n');

  // Everything the model is about to see, before it decides anything.
  emit('agent_input', agentInputFields({ history, catalogCount: catalog.products.length, systemPrompt: conv.channel.agent.systemPrompt }));

  // Resolve the real sendMessage function here; the override (if any) is
  // injected into the Agent so the same path is exercised whether or not we
  // are in test mode.
  const resolvedSendMessage = sendMessageOverride ?? sendMessage;

  const agent = new Agent({
    systemPrompt: conv.channel.agent.systemPrompt,
    business: conv.business ?? { id: conv.businessId, name: 'Store' },
    history,
    conversationId: conv.id,
    pageToken: conv.channel.apiToken,
    customerPlatformId: conv.customerPlatformId,
    customerName: conv.customerName,
    catalogSummary,
    emitSse,
    sendMessageOverride: resolvedSendMessage,
  });

  const started = performance.now();
  let ok = false;
  let replyText = '';
  let metrics: TokenUsageMetrics | undefined;
  let sentViaFallback = 0;
  let clearedCount = 0;
  let stateSetTo = 'working';
  let runError: unknown;

  try {
    const run = await agent.run();
    replyText = run.replyText;
    metrics = run.metrics;

    // Log token metrics for this Messenger conversation turn
    try {
      const { recordTokenUsage } = await import('@repo/db/crud/token-analytics');
      await recordTokenUsage({
        businessId: conv.businessId,
        channelId: conv.channelId,
        conversationId: conv.id,
        integrationType: 'facebook_messenger',
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

    // #8: the send_message tool is the source of truth — it sends AND persists
    // the exact text. Only fall back to sending+saving the final LLM message if
    // the agent never called send_message (so the customer still gets a reply).
    if (agent.sentTexts.length === 0 && replyText) {
      console.log(`[agent-runner-core] fallback: agent did not call send_message, sending final reply directly`);
      emitSse('message_sent', { text: replyText, fallback: true });
      await resolvedSendMessage(conv.channel.apiToken, conv.customerPlatformId, replyText);
      await createMessage({
        conversationId: conv.id,
        from: 'self',
        content: replyText,
        state: 'done',
      });
      sentViaFallback = 1;
    }

    // Clear only the messages the agent actually replied to; anything that
    // arrived during the run remains pending and triggers a follow-up run.
    await markMessagesDoneByIds(conv.id, repliedMessageIds);
    clearedCount = repliedMessageIds.length;
    await updateConversationState(conv.id, 'done');
    stateSetTo = 'done';
    console.log(`[agent-runner-core] conversation ${conversationId} state → done`);
    emitSse('runner_done', { conversationId });
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
    // send_message that is either the Graph send or the history write failing,
    // and LangGraph feeds the error back to the model as a tool message.
    emitAnomaly('tool_call_unresolved', { detail: unresolved });
  }
  if (sentViaTool > 0 && sentViaFallback > 0) {
    emitAnomaly('double_send');
  }
  if (ok && clearedCount > 0 && sentViaTool + sentViaFallback === 0) {
    // The defect the 200 response hides: the backlog was marked answered after
    // nothing was sent, so no later run will ever reply to these messages.
    emitAnomaly('backlog_claimed_but_unanswered', { count: clearedCount });
  }

  // If new customer messages arrived while we were running (or were left
  // pending), the tail re-trigger below handles them in a fresh invocation.
  const hasPending = await checkPendingMessages(conv.id);

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
    await triggerAgentRun(conversationId);
  }
}
