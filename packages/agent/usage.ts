/**
 * A turn's token spend is not only what the sales model wrote.
 *
 * Tools such as `getProductInfoWithQuery` run a second model call of their own, and
 * the runner bills the customer for the turn, not for one call inside it. The
 * collector is shared by the Agent and every tool that can spend tokens, so the
 * counters the runner records in `llm_token_logs` match the provider's bill.
 */
export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens the provider answered from its own cache. */
  cacheHitTokens: number;
}

export interface AgentUsageCollector extends AgentTokenUsage {
  /** How many helper calls actually reported usage. */
  calls: number;
  add(usage: Partial<AgentTokenUsage>): void;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function createAgentUsageCollector(): AgentUsageCollector {
  const collector: AgentUsageCollector = {
    inputTokens: 0,
    outputTokens: 0,
    cacheHitTokens: 0,
    calls: 0,
    add(usage) {
      const inputTokens = count(usage.inputTokens);
      const outputTokens = count(usage.outputTokens);
      const cacheHitTokens = count(usage.cacheHitTokens);
      // A model that reports nothing is not a free call worth inventing usage for.
      if (inputTokens + outputTokens + cacheHitTokens === 0) return;
      collector.inputTokens += inputTokens;
      collector.outputTokens += outputTokens;
      collector.cacheHitTokens += cacheHitTokens;
      collector.calls += 1;
    },
  };
  return collector;
}
