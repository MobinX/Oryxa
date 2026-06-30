import type { SseEmitter } from '@repo/agent';

export interface AgentRunOptions {
  /**
   * If provided, structured debug events are emitted for every tool call,
   * tool result, and final reply. Production runs leave this undefined.
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
  const { emitSse, sendMessageOverride } = opts;

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
  const { sendMessage } = await import('@repo/integrations/facebook');

  const conv = await getConversationWithHistory(conversationId);
  if (!conv?.channel?.agent) {
    console.log(`[agent-runner-core] no agent on conversation ${conversationId} — skipping`);
    return;
  }

  // Atomic claim: only one concurrent caller transitions idle→working and gets
  // to run the agent. This is the single race-free gate that prevents duplicate
  // runs when overlapping webhooks or the tail re-trigger fire at the same time.
  const claimed = await claimConversationForAgentRun(conv.id);
  if (!claimed) {
    console.log(`[agent-runner-core] conversation ${conversationId} already working — skipping duplicate`);
    return;
  }

  console.log(`[agent-runner-core] claimed conversation ${conversationId} — starting agent run`);
  emitSse?.('runner_start', { conversationId });

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

  console.log(`[agent-runner-core] history compiled — ${history.length} messages (${pendingMsgs.length} pending, ${conv.messages.length} from context)`);

  const catalog = await listProducts(conv.businessId, { limit: 10 });
  const catalogSummary = catalog.products
    .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
    .join('\n');

  console.log(`[agent-runner-core] catalog loaded — ${catalog.products.length} products`);

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

  try {
    const reply = await agent.run();

    // #8: the send_message tool is the source of truth — it sends AND persists
    // the exact text. Only fall back to sending+saving the final LLM message if
    // the agent never called send_message (so the customer still gets a reply).
    if (agent.sentTexts.length === 0 && reply) {
      console.log(`[agent-runner-core] fallback: agent did not call send_message, sending final reply directly`);
      emitSse?.('message_sent', { text: reply, fallback: true });
      await resolvedSendMessage(conv.channel.apiToken, conv.customerPlatformId, reply);
      await createMessage({
        conversationId: conv.id,
        from: 'self',
        content: reply,
        state: 'done',
      });
    }

    // Clear only the messages the agent actually replied to; anything that
    // arrived during the run remains pending and triggers a follow-up run.
    await markMessagesDoneByIds(conv.id, repliedMessageIds);
    await updateConversationState(conv.id, 'done');
    console.log(`[agent-runner-core] conversation ${conversationId} state → done`);
    emitSse?.('runner_done', { conversationId });
  } catch (err) {
    console.error('[agent-runner-core] agent run failed:', err);
    emitSse?.('runner_error', { conversationId, error: String(err) });
    await updateConversationState(conv.id, 'done');
  }

  // If new customer messages arrived while we were running (or were left
  // pending), re-trigger so they're handled too.
  const hasPending = await checkPendingMessages(conv.id);
  if (hasPending) {
    console.log(`[agent-runner-core] found more pending messages — re-triggering`);
    // Re-trigger via HTTP so the new run is handled by the same routing
    // (background on Bun, waitUntil on Vercel). Import lazily to keep this
    // module free of circular deps.
    const { triggerAgentRun } = await import('@api/lib/agent-runner');
    await triggerAgentRun(conversationId);
  }
}
