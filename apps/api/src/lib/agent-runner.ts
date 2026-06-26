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
    markCustomerMessagesDone,
  } = await import('@repo/db/crud/conversation');
  const { Agent } = await import('@repo/agent');
  const { listProducts } = await import('@repo/db/crud/product');

  const conv = await getConversationWithHistory(conversationId);
  if (!conv?.channel?.agent) return;

  await updateConversationState(conv.id, 'working');

  const catalog = await listProducts(conv.businessId, { limit: 10 });
  const catalogSummary = catalog.products
    .map((p) => `- ${p.name} ($${p.price}) SKU: ${p.sku}`)
    .join('\n');

  const agent = new Agent({
    systemPrompt: conv.channel.agent.systemPrompt,
    business: conv.business ?? { id: conv.businessId, name: 'Store' },
    history: conv.messages.map((m) => ({ from: m.from, content: m.content })),
    conversationId: conv.id,
    pageToken: conv.channel.apiToken,
    customerPlatformId: conv.customerPlatformId,
    customerName: conv.customerName,
    catalogSummary,
  });

  try {
    const reply = await agent.run();
    await createMessage({
      conversationId: conv.id,
      from: 'self',
      content: reply,
      state: 'done',
    });
    await markCustomerMessagesDone(conv.id);
    await updateConversationState(conv.id, 'done');
  } catch (err) {
    console.error('Agent run failed:', err);
    await updateConversationState(conv.id, 'done');
  }

  const hasPending = await checkPendingMessages(conv.id);
  if (hasPending) {
    triggerAgentRun(conversationId);
  }
}
