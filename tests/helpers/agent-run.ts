import type { AgentRunResult, TokenUsageMetrics } from '@repo/agent';

// Synthetic telemetry: the runners only forward these to recordTokenUsage, so an
// obviously fake provider/model keeps test rows from being mistaken for real usage.
export const FIXTURE_METRICS: TokenUsageMetrics = {
  provider: 'test-provider',
  model: 'test-model',
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  cacheHitPercent: 0,
  latencyMs: 0,
  estimatedCostUsd: 0,
};

export function agentRunResult(replyText: string, sentTexts: string[] = []): AgentRunResult {
  return { replyText, sentTexts, metrics: FIXTURE_METRICS };
}

/**
 * Mock implementation for Agent.prototype.run. The runners gate their fallback on the
 * instance's `sentTexts` (not the result's), so this writes both from one argument the
 * way the real Agent shares a single array between the two.
 */
export function stubAgentRun(replyText: string, sentTexts: string[] = []) {
  return async function (this: { sentTexts: string[] }): Promise<AgentRunResult> {
    this.sentTexts = sentTexts;
    return agentRunResult(replyText, sentTexts);
  };
}
