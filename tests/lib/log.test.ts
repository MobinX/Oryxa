import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { emit, flush, sanitizeUrl, __testOnly } from '@api/lib/log';
import { startContext, withContext, tagContext } from '@api/lib/ctx';

type Event = Record<string, unknown>;

const originalEnv = { ...process.env };

beforeEach(() => {
  __testOnly.reset();
  __testOnly.setSink('axiom');
});

afterEach(() => {
  __testOnly.reset();
  for (const key of ['LOG_MAX_EVENTS', 'LOG_CONTENT', 'LOG_TRUNCATE', 'AXIOM_TOKEN', 'AXIOM_DATASET']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

/** Runs `work` inside one invocation context and returns every batch that went out. */
async function captured(work: () => void | Promise<void>): Promise<{ batches: Event[][]; events: Event[] }> {
  const batches: Event[][] = [];
  __testOnly.setIngest((events) => {
    batches.push(events);
    return Promise.resolve();
  });
  await withContext(startContext(), async () => {
    await work();
    await flush();
  });
  return { batches, events: batches.flat() };
}

describe('constraint A — one ingest request per invocation', () => {
  it('sends a whole invocation of events in exactly one request', async () => {
    const { batches, events } = await captured(() => {
      for (let i = 0; i < 200; i++) emit('webhook_item', { kind: 'message', externalId: `mid-${i}` });
    });
    expect(batches).toHaveLength(1);
    expect(events).toHaveLength(200);
  });

  it('makes no HTTP request at all when nothing was emitted', async () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    process.env.AXIOM_TOKEN = 'test-token';
    __testOnly.setIngest(undefined);
    try {
      await withContext(startContext(), async () => {
        await flush();
        await flush();
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reaches the network once for the queue, not once per event', async () => {
    const urls: string[] = [];
    const original = globalThis.fetch;
    process.env.AXIOM_TOKEN = 'test-token';
    process.env.AXIOM_DATASET = 'oryxa-test';
    globalThis.fetch = vi.fn(async (input: unknown) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({ ingested: 3, failed: 0, processedBytes: 100, blocksCreated: 1, walLength: 0 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    try {
      await withContext(startContext(), async () => {
        emit('webhook_item', { kind: 'a', externalId: '1' });
        emit('webhook_item', { kind: 'b', externalId: '2' });
        emit('webhook_item', { kind: 'c', externalId: '3' });
        await flush();
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/v1/datasets/oryxa-test/ingest');
  });

  it('queues without touching fetch, so a request is never slowed by a log line', async () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      await captured(() => {
        for (let i = 0; i < 50; i++) emit('webhook_item', { kind: 'x', externalId: `e${i}` });
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('constraint B — every log is unique', () => {
  it('drops a repeated fact inside one invocation', async () => {
    const { events } = await captured(() => {
      emit('anomaly', { kind: 'double_send' });
      emit('anomaly', { kind: 'double_send' });
      emit('anomaly', { kind: 'double_send', detail: 'later detail' });
    });
    expect(events.filter((e) => e.evt === 'anomaly')).toHaveLength(1);
  });

  it('keeps the same fact from two different invocations', async () => {
    const first = await captured(() => emit('anomaly', { kind: 'claim_lost' }));
    const second = await captured(() => emit('anomaly', { kind: 'claim_lost' }));
    expect(first.events.filter((e) => e.evt === 'anomaly')).toHaveLength(1);
    expect(second.events.filter((e) => e.evt === 'anomaly')).toHaveLength(1);
  });

  it('treats different anomaly kinds as different facts', async () => {
    const { events } = await captured(() => {
      emit('anomaly', { kind: 'claim_lost' });
      emit('anomaly', { kind: 'double_send' });
    });
    expect(events.filter((e) => e.evt === 'anomaly')).toHaveLength(2);
  });

  it('dedupes tool events by call id but keeps distinct calls', async () => {
    const { events } = await captured(() => {
      emit('tool_call', { tool: 'search_products', toolCallId: 'call-1' });
      emit('tool_call', { tool: 'search_products', toolCallId: 'call-1' });
      emit('tool_call', { tool: 'send_message', toolCallId: 'call-2' });
    });
    const calls = events.filter((e) => e.evt === 'tool_call');
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.toolCallId)).toEqual(['call-1', 'call-2']);
  });

  it('stamps the invocation correlation ids on every event', async () => {
    const { events } = await captured(() => {
      tagContext({ conversationId: 'conv-9', runDepth: 2 });
      emit('webhook_item', { kind: 'message', externalId: 'm1' });
    });
    const event = events[0];
    expect(typeof event.requestId).toBe('string');
    expect(typeof event.runId).toBe('string');
    expect(event.conversationId).toBe('conv-9');
    expect(event.runDepth).toBe(2);
    expect(typeof event.time).toBe('string');
  });
});

describe('closed field vocabulary and redaction', () => {
  it('drops fields outside the allowlist instead of creating dataset fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { events } = await captured(() => {
      emit('req', { method: 'GET', path: '/x', status: 200, someAdHocKey: 'value' });
    });
    warn.mockRestore();
    expect(events[0]).not.toHaveProperty('someAdHocKey');
    expect(events[0]).toMatchObject({ method: 'GET', status: 200 });
  });

  it('never carries a token-shaped value out of the process', async () => {
    const { events } = await captured(() => {
      emit('tool_result', { tool: 'publish_post', toolCallId: 'c1', result: 'failed: https://graph.facebook.com/v21.0/me/feed?access_token=EAAYabcdef123' });
      emit('req', { method: 'POST', path: '/x', userAgent: 'Bearer sk-supersecret' });
    });
    const wire = JSON.stringify(events);
    expect(wire).not.toContain('EAAY');
    expect(wire).not.toContain('sk-supersecret');
    expect(wire).not.toContain('Bearer ');
    expect(wire).toContain('[redacted]');
  });

  it('strips query strings from URLs', () => {
    const safe = sanitizeUrl('https://graph.facebook.com/v21.0/123?access_token=EAAYxyz&fields=id');
    expect(safe).toEqual({ host: 'graph.facebook.com', targetPath: '/v21.0/123' });
    expect(JSON.stringify(safe)).not.toContain('EAAY');
  });

  it('honours LOG_CONTENT=none for customer text but keeps diagnostics', async () => {
    process.env.LOG_CONTENT = 'none';
    const { events } = await captured(() => {
      emit('tool_result', { tool: 'search_products', toolCallId: 'c1', result: 'customer text here', durationMs: 12 });
    });
    expect(events[0]).not.toHaveProperty('result');
    expect(events[0]).toMatchObject({ tool: 'search_products', durationMs: 12 });
  });

  it('honours LOG_CONTENT=reply-only', async () => {
    process.env.LOG_CONTENT = 'reply-only';
    const { events } = await captured(() => {
      emit('agent_run', { ok: true, replyText: 'the bot reply', pendingClaimed: 2 });
      emit('agent_input', { historyLength: 2, turns: [{ from: 'customer', content: 'private' }] });
    });
    const run = events.find((e) => e.evt === 'agent_run');
    const input = events.find((e) => e.evt === 'agent_input');
    expect(run).toMatchObject({ replyText: 'the bot reply' });
    expect(input).not.toHaveProperty('turns');
    expect(input).toMatchObject({ historyLength: 2 });
  });

  it('truncates long text to the configured cap', async () => {
    process.env.LOG_TRUNCATE = '50';
    const { events } = await captured(() => {
      emit('req', { method: 'GET', path: `/${'y'.repeat(500)}`, status: 200 });
    });
    expect((events[0].path as string).length).toBeLessThanOrEqual(51);
  });
});

describe('a logging fault cannot become an application fault', () => {
  it('survives an unserializable field value', async () => {
    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    const { events } = await captured(() => {
      expect(() => emit('tool_call', { tool: 'x', toolCallId: 'c1', args: circular })).not.toThrow();
    });
    const call = events.find((e) => e.evt === 'tool_call');
    expect(typeof call?.args).toBe('string');
  });

  it('resolves rather than rejects when the transport fails', async () => {
    __testOnly.setIngest(() => Promise.reject(new Error('ingest down')));
    await withContext(startContext(), async () => {
      emit('webhook_item', { kind: 'x', externalId: '1' });
      await expect(flush()).resolves.toBeUndefined();
    });
  });

  it('caps the queue and reports the loss as one log_dropped event', async () => {
    process.env.LOG_MAX_EVENTS = '10';
    const { events } = await captured(() => {
      for (let i = 0; i < 25; i++) emit('webhook_item', { kind: 'x', externalId: `e${i}` });
    });
    expect(events).toHaveLength(11);
    const dropped = events[10];
    expect(dropped.evt).toBe('log_dropped');
    expect(dropped.droppedEvents).toBe(15);
  });

  it('emits nothing to stdout when the sink is axiom', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await captured(() => emit('webhook_item', { kind: 'x', externalId: '1' }));
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
