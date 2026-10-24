import type { InboxSuggestion, TokenUsageMetrics } from '@repo/agent';

/**
 * Builds the merchant-facing suggestions for a thread whose auto-pilot is off.
 *
 * It reuses the store's answering agent system prompt, history and catalog summary — the
 * same facts a real reply sees — but swaps the tool set for recorders, so nothing can be
 * sent. Only the newest turn is considered, and a thread already answered by the merchant
 * gets no suggestions.
 */
export async function runSuggestionAgent(
  conversationId: string,
): Promise<{ forMessageId: string | null; suggestions: InboxSuggestion[] }> {
  const { getConversationWithHistory } = await import('@repo/db/crud/conversation');
  const { resolveAnsweringAgent } = await import('@repo/db/crud/default-agent');
  const { Agent, createSuggestionTools, SUGGESTION_GUIDANCE } = await import('@repo/agent');
  const { buildCatalogSummary } = await import('./catalog-summary');

  const conv = await getConversationWithHistory(conversationId);
  if (!conv?.channel || conv.businessId == null) {
    return { forMessageId: null, suggestions: [] };
  }
  if (conv.autoPilot) {
    return { forMessageId: null, suggestions: [] };
  }

  // Newest first: only a turn the customer spoke last is worth answering.
  const latest = conv.messages[0];
  if (!latest || latest.from !== 'customer') {
    return { forMessageId: null, suggestions: [] };
  }

  const businessId = conv.businessId;
  const answering = await resolveAnsweringAgent(conv.channel.agent);
  const catalog = await buildCatalogSummary(businessId);
  const platform = conv.channel.platform === 'instagram' ? 'instagram' : 'facebook';

  const history = [...conv.messages]
    .reverse()
    .slice(-20)
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      from: message.from,
      content: message.content,
      imageKeys: [],
      hadImages: message.imageKeys.length > 0,
    }));

  const sink: InboxSuggestion[] = [];
  const agent = new Agent({
    systemPrompt: answering.systemPrompt,
    business: conv.business ?? { id: businessId, name: 'Store' },
    history,
    conversationId: conv.id,
    pageToken: conv.channel.apiToken,
    customerPlatformId: conv.customerPlatformId,
    customerName: conv.customerName,
    platform,
    catalogSummary: catalog.summary,
    tools: createSuggestionTools(businessId, conv.customerPlatformId, sink),
    replyGuidance: SUGGESTION_GUIDANCE,
    validationChannel: 'messenger',
    // A suggestion panel is read, not heard: the faster effort keeps it cheap enough to
    // generate on every customer turn.
    reasoningEffort: 'low',
  });

  let replyText = '';
  let metrics: TokenUsageMetrics | undefined;
  try {
    const run = await agent.run();
    replyText = run.replyText;
    metrics = run.metrics;
  } catch (err) {
    console.error('[suggestion-runner] agent run failed:', err);
  }

  // Suggestions cost tokens like any other turn, so they land in the same business
  // token table under their own lane instead of disappearing from the bill.
  if (metrics) {
    try {
      const { recordTokenUsage } = await import('@repo/db/crud/token-analytics');
      await recordTokenUsage({
        businessId,
        channelId: conv.channelId,
        conversationId: conv.id,
        integrationType: 'inbox_suggestion',
        provider: metrics.provider,
        model: metrics.model,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalTokens: metrics.totalTokens,
        cacheHitTokens: metrics.cacheHitTokens,
        cacheMissTokens: metrics.cacheMissTokens,
        cacheHitPercent: metrics.cacheHitPercent,
        latencyMs: metrics.latencyMs,
      });
    } catch (err) {
      console.error('[suggestion-runner] failed to record token usage:', err);
    }
  }

  const seen = new Set<string>();
  const suggestions: InboxSuggestion[] = [];
  for (const suggestion of sink) {
    if (seen.has(suggestion.id)) continue;
    seen.add(suggestion.id);
    suggestions.push(suggestion);
  }

  // The model's closing text is a usable reply when it chose not to call suggest_text.
  if (
    !suggestions.some((s) => s.kind === 'text') &&
    replyText.trim() &&
    replyText.trim().toUpperCase() !== 'SILENT'
  ) {
    suggestions.unshift({ id: 'text:fallback', kind: 'text', text: replyText.trim() });
  }

  return { forMessageId: latest.id, suggestions: suggestions.slice(0, 6) };
}
