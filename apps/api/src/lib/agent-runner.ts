const AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'dev-internal-key';

export function triggerAgentRun(conversationId: string): void {
  fetch(`${AGENT_RUNNER_URL}/internal/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify({ conversationId }),
  }).catch((err) => console.error('Failed to trigger agent run:', err));
}

export async function runAgentForConversation(conversationId: string): Promise<void> {
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
  if (!conv?.channel?.agent) return;

  // Atomic claim: only one concurrent caller transitions idle→working and gets
  // to run the agent. This is the single race-free gate that prevents duplicate
  // runs when overlapping webhooks or the tail re-trigger fire at the same time.
  const claimed = await claimConversationForAgentRun(conv.id);
  if (!claimed) return;

  // Drain the ENTIRE backlog in this run: snapshot every pending customer
  // message (oldest first, no cap) so the agent replies to all of them in order
  // instead of only the most recent 10 and leaving older ones for a later,
  // out-of-order follow-up run.
  const pendingMsgs = await listPendingCustomerMessages(conv.id);
  const repliedMessageIds = pendingMsgs.map((m) => m.id);

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
  const catalogSummary = catalog.products
    .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
    .join('\n');

  const agent = new Agent({
    systemPrompt: conv.channel.agent.systemPrompt,
    business: conv.business ?? { id: conv.businessId, name: 'Store' },
    history,
    conversationId: conv.id,
    pageToken: conv.channel.apiToken,
    customerPlatformId: conv.customerPlatformId,
    customerName: conv.customerName,
    catalogSummary,
  });

  try {
    const reply = await agent.run();

    // #8: the send_message tool is the source of truth — it sends AND persists
    // the exact text. Only fall back to sending+saving the final LLM message if
    // the agent never called send_message (so the customer still gets a reply).
    if (agent.sentTexts.length === 0 && reply) {
      await sendMessage(conv.channel.apiToken, conv.customerPlatformId, reply);
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
  } catch (err) {
    console.error('Agent run failed:', err);
    await updateConversationState(conv.id, 'done');
  }

  // If new customer messages arrived while we were running (or were left
  // pending), re-trigger so they're handled too.
  const hasPending = await checkPendingMessages(conv.id);
  if (hasPending) {
    triggerAgentRun(conversationId);
  }
}
