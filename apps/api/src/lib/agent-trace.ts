import type { SseEmitter, TokenUsageMetrics } from '@repo/agent';
import { emit } from '@api/lib/log';
import { currentContext } from '@api/lib/ctx';

/**
 * Read-only view of one agent run's tool activity, for the outcome event.
 */
export interface AgentTrace {
  /** Pass this to `Agent` in place of the caller's emitter; it forwards every event unchanged. */
  emitSse: SseEmitter;
  toolCallCount(): number;
  /** Tools that reported a call but never a result — `name:count` pairs, `''` when none. */
  unresolved(): string;
}

interface OpenCall {
  toolCallId: string;
  started: number;
}

function tenth(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/**
 * Logs the agent's decision trace: which tool was called with which arguments,
 * and what it handed back.
 *
 * Only `tool_call` and `tool_result` are forwarded to the log. The rest of the
 * SSE vocabulary (`agent_start`, `reply`, `runner_*`, `message_sent`) describes
 * facts the single `evt=agent_run` outcome event already owns, so copying them
 * would state the same thing twice.
 *
 * The agent's emitter contract carries no call id, so a result is matched to its
 * call through a per-tool FIFO: calls of the same tool are answered in order, and
 * different tools never collide. A call left open when the run ends is the
 * signature of a tool that threw — LangGraph turns that into an error tool
 * message, so the `tool_result` event is never emitted.
 */
export function createAgentTrace(forward?: SseEmitter): AgentTrace {
  const open = new Map<string, OpenCall[]>();
  let seq = 0;
  let calls = 0;

  const emitSse: SseEmitter = (event, data) => {
    forward?.(event, data);
    if (event !== 'tool_call' && event !== 'tool_result') return;
    try {
      const record = (data ?? {}) as { name?: unknown; args?: unknown; result?: unknown };
      const tool = typeof record.name === 'string' && record.name ? record.name : 'unknown';

      if (event === 'tool_call') {
        // Read lazily: the ids only mean something inside the invocation that
        // owns the run, which may start after this adapter was built.
        const entry: OpenCall = {
          toolCallId: `${currentContext()?.runId ?? 'run'}#${++seq}`,
          started: performance.now(),
        };
        calls++;
        const queue = open.get(tool);
        if (queue) queue.push(entry);
        else open.set(tool, [entry]);
        emit('tool_call', { tool, toolCallId: entry.toolCallId, args: record.args });
        return;
      }

      const queue = open.get(tool);
      const matched = queue?.shift();
      emit('tool_result', {
        tool,
        ...(matched
          ? { toolCallId: matched.toolCallId, durationMs: tenth(performance.now() - matched.started) }
          : {}),
        result: record.result,
      });
    } catch {
      // A broken trace must never break the run it describes.
    }
  };

  return {
    emitSse,
    toolCallCount: () => calls,
    unresolved: () =>
      [...open.entries()]
        .filter(([, queue]) => queue.length > 0)
        .map(([tool, queue]) => `${tool}:${queue.length}`)
        .join(','),
  };
}

/** The token counters, flattened onto an `evt=agent_run`. `latencyMs` is the run's own duration. */
export function tokenFields(metrics: TokenUsageMetrics | undefined): Record<string, unknown> {
  if (!metrics) return {};
  return {
    provider: metrics.provider,
    model: metrics.model,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    totalTokens: metrics.totalTokens,
    cacheHitTokens: metrics.cacheHitTokens,
    cacheMissTokens: metrics.cacheMissTokens,
    cacheHitPercent: metrics.cacheHitPercent,
    estimatedCostUsd: metrics.estimatedCostUsd,
  };
}

/** Compact, chronological view of what the model was actually shown. */
export function agentInputFields(input: {
  history: Array<{ from: string; content: string }>;
  catalogCount: number;
  systemPrompt: string;
}): Record<string, unknown> {
  return {
    historyLength: input.history.length,
    turns: input.history,
    catalogCount: input.catalogCount,
    systemPromptLength: input.systemPrompt.length,
  };
}
