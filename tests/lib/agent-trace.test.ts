import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAgentTrace, tokenFields, agentInputFields } from '@api/lib/agent-trace';
import { __testOnly, emit, flush } from '@api/lib/log';
import { startContext, withContext } from '@api/lib/ctx';

type Event = Record<string, unknown>;

const originalEnv = { ...process.env };

beforeEach(() => {
  __testOnly.reset();
  __testOnly.setSink('axiom');
  // No test in here needs the network; `captured` replaces this with a recorder.
  __testOnly.setIngest(() => Promise.resolve());
});

afterEach(() => {
  __testOnly.reset();
  for (const key of ['LOG_CONTENT', 'LOG_TRUNCATE', 'LOG_TRUNCATE_HISTORY']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

/** Runs `work` inside one invocation context, then returns what left the queue. */
async function captured(work: () => void): Promise<Event[]> {
  const batches: Event[][] = [];
  __testOnly.setIngest((events) => {
    batches.push(events);
    return Promise.resolve();
  });
  await withContext(startContext(), async () => {
    work();
    await flush();
  });
  return batches.flat();
}

const of = (events: Event[], evt: string) => events.filter((e) => e.evt === evt);

describe('agent trace adapter', () => {
  it('forwards every event to the caller emitter, unchanged in name', async () => {
    const seen: Array<{ event: string; data: unknown }> = [];
    const trace = createAgentTrace((event, data) => seen.push({ event, data }));

    await withContext(startContext(), async () => {
      trace.emitSse('agent_start', { conversationId: 'c1', historyLen: 2 });
      trace.emitSse('tool_call', { name: 'get_product', args: { query: 'tee' } });
      trace.emitSse('tool_result', { name: 'get_product', result: '[]' });
      trace.emitSse('reply', { text: 'hi' });
      await flush();
    });

    expect(seen.map((s) => s.event)).toEqual(['agent_start', 'tool_call', 'tool_result', 'reply']);
    expect(seen[1].data).toEqual({ name: 'get_product', args: { query: 'tee' } });
  });

  it('logs no event for the SSE narration the outcome event already owns', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('agent_start', { conversationId: 'c1', historyLen: 2 });
      trace.emitSse('runner_start', { conversationId: 'c1' });
      trace.emitSse('message_sent', { text: 'hi', fallback: true });
      trace.emitSse('reply', { text: 'hi' });
      trace.emitSse('runner_done', { conversationId: 'c1' });
    });

    // Nothing was queued, so nothing was sent and no HTTP request was made.
    expect(events).toEqual([]);
  });

  it('records a call and its result with one shared id and the tool duration', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', { name: 'get_order', args: { orderId: 'o-1' } });
      trace.emitSse('tool_result', { name: 'get_order', result: '{"state":"pending"}' });
    });

    const call = of(events, 'tool_call')[0];
    const result = of(events, 'tool_result')[0];
    expect(call).toMatchObject({ tool: 'get_order', args: '{"orderId":"o-1"}' });
    expect(result).toMatchObject({ tool: 'get_order', result: '{"state":"pending"}' });
    expect(result.toolCallId).toBe(call.toolCallId);
    expect(typeof result.durationMs).toBe('number');
    expect(call.toolCallId).toBe(`${call.runId}#1`);
  });

  it('pairs interleaved tools with their own results, not with the next one', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', { name: 'get_product', args: { query: 'a' } });
      trace.emitSse('tool_call', { name: 'get_order', args: { orderId: 'o-1' } });
      trace.emitSse('tool_result', { name: 'get_order', result: 'ORDER' });
      trace.emitSse('tool_result', { name: 'get_product', result: 'PRODUCTS' });
    });

    const byId = new Map(of(events, 'tool_call').map((e) => [e.toolCallId, e.tool]));
    for (const result of of(events, 'tool_result')) {
      expect(byId.get(result.toolCallId)).toBe(result.tool);
    }
    expect(of(events, 'tool_result').find((r) => r.tool === 'get_order')?.result).toBe('ORDER');
    expect(trace.unresolved()).toBe('');
  });

  it('keeps two calls of the same tool as two facts', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', { name: 'get_product', args: { query: 'tee' } });
      trace.emitSse('tool_result', { name: 'get_product', result: 'first' });
      trace.emitSse('tool_call', { name: 'get_product', args: { query: 'tee' } });
      trace.emitSse('tool_result', { name: 'get_product', result: 'second' });
    });

    const calls = of(events, 'tool_call');
    const results = of(events, 'tool_result');
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((c) => c.toolCallId)).size).toBe(2);
    // A repeat is answered in order, so each result pairs with its own call.
    expect(results.map((r) => r.result)).toEqual(['first', 'second']);
    expect(trace.toolCallCount()).toBe(2);
  });

  it('reports a call that never got a result — the signature of a tool that threw', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', { name: 'send_message', args: { text: 'hello' } });
      trace.emitSse('tool_call', { name: 'get_order', args: { orderId: 'o-1' } });
      trace.emitSse('tool_result', { name: 'get_order', result: '{}' });
    });

    expect(of(events, 'tool_result')).toHaveLength(1);
    expect(trace.unresolved()).toBe('send_message:1');
  });

  it('survives a malformed agent event and never steals a pairing from another tool', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', null);
      trace.emitSse('tool_call', { name: 'get_order', args: { orderId: 'o-1' } });
      trace.emitSse('tool_result', { name: 'get_order', result: '{}' });
      trace.emitSse('tool_result', { noName: true });
      trace.emitSse('tool_result', { name: 'cancel_order', result: 'no call ever came' });
    });

    const calls = of(events, 'tool_call');
    const results = of(events, 'tool_result');
    expect(calls).toHaveLength(2);
    expect(results).toHaveLength(3);
    // The unnamed pair still matches itself; the orphan result claims nothing.
    expect(results.find((r) => r.tool === 'get_order')?.toolCallId).toBe(
      calls.find((c) => c.tool === 'get_order')?.toolCallId,
    );
    expect(results.find((r) => r.tool === 'unknown')?.toolCallId).toBe(
      calls.find((c) => c.tool === 'unknown')?.toolCallId,
    );
    expect(results.find((r) => r.tool === 'cancel_order')?.toolCallId).toBeUndefined();
    // An orphan result leaves nothing open: it borrowed no other tool's call.
    expect(trace.unresolved()).toBe('');
  });

  it('holds no correlation id of its own — every event carries the run it belongs to', async () => {
    const trace = createAgentTrace();
    const events = await captured(() => {
      trace.emitSse('tool_call', { name: 'get_product', args: { query: 'tee' } });
    });
    expect(of(events, 'tool_call')[0].runId).toBeTruthy();
  });
});

describe('outcome field helpers', () => {
  it('adds nothing to the outcome event when the run produced no metrics', () => {
    expect(tokenFields(undefined)).toEqual({});
    expect(tokenFields({
      provider: 'openai', model: 'gpt-5-mini', inputTokens: 10, outputTokens: 4, totalTokens: 14,
      cacheHitTokens: 6, cacheMissTokens: 4, cacheHitPercent: 60, latencyMs: 900, estimatedCostUsd: 0.0001,
    })).toMatchObject({ provider: 'openai', totalTokens: 14, estimatedCostUsd: 0.0001 });
  });

  it('keeps the transcript chronological and counts the catalog without naming products', () => {
    const systemPrompt = 'You are a helpful sales assistant.';
    const fields = agentInputFields({
      history: [{ from: 'customer', content: 'price?' }, { from: 'self', content: '29.99' }],
      catalogCount: 3,
      systemPrompt,
    });
    expect(fields.historyLength).toBe(2);
    expect(fields.turns).toEqual([{ from: 'customer', content: 'price?' }, { from: 'self', content: '29.99' }]);
    expect(fields.catalogCount).toBe(3);
    // The prompt itself is never logged — only its length, so a prompt edit is
    // visible in the volume without copying business text into the log.
    expect(fields.systemPromptLength).toBe(systemPrompt.length);
  });

  it('carries a long history without cutting the newest turns', async () => {
    process.env.LOG_TRUNCATE = '40';
    const history = Array.from({ length: 20 }, (_, i) => ({
      from: i % 2 === 0 ? 'customer' : 'self',
      content: `turn ${i} — ${'x'.repeat(300)}`,
    }));

    const events = await captured(() => {
      emit('agent_input', agentInputFields({ history, catalogCount: 0, systemPrompt: 'p' }));
    });

    const input = of(events, 'agent_input')[0];
    const turns = String(input.turns);
    expect(input.historyLength).toBe(20);
    // Past the 4000-char blob cap, so the newest turns are the ones that would
    // have been lost without a transcript-sized tier.
    expect(turns.length).toBeGreaterThan(4000);
    expect(turns).toContain('turn 19');
    expect(turns.length).toBeLessThanOrEqual(12_000);
  });
});
