import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildApl,
  decodeCursor,
  encodeCursor,
  logQuerySource,
  queryLogs,
  __testOnly as querySeam,
  type LogFilter,
} from '@api/lib/log-query';
import { emit, storedEvents, __testOnly } from '@api/lib/log';
import { startContext, withContext } from '@api/lib/ctx';
import type { LogEventRow } from '@repo/shared';

const WINDOW = { startTime: '2026-10-01T12:00:00.000Z', endTime: '2026-10-01T13:00:00.000Z' };

function filter(overrides: Partial<LogFilter> = {}): LogFilter {
  return { ...WINDOW, limit: 50, ...overrides };
}

describe('the APL the query route sends', () => {
  const previous = { dataset: process.env.AXIOM_DATASET, token: process.env.AXIOM_TOKEN };

  afterEach(() => {
    if (previous.dataset === undefined) delete process.env.AXIOM_DATASET;
    else process.env.AXIOM_DATASET = previous.dataset;
    if (previous.token === undefined) delete process.env.AXIOM_TOKEN;
    else process.env.AXIOM_TOKEN = previous.token;
  });

  it('targets the configured dataset and pages by limit', () => {
    process.env.AXIOM_DATASET = 'oryxa-prod';
    expect(buildApl(filter())).toBe("['oryxa-prod'] | sort by _time desc | limit 50");
  });

  it('narrows to one event type inside the query, not the request body', () => {
    expect(buildApl(filter({ evt: 'agent_run' }))).toContain("| where evt == 'agent_run' |");
  });

  it('excludes the reasons a rejection count must not count, in the grammar the store accepts', () => {
    process.env.AXIOM_DATASET = 'oryxa-prod';
    // `and` is asserted against the live dataset: `&&` answers HTTP 400.
    expect(buildApl(filter({ evt: 'auth', notReasons: ['logs_operator', 'dev_bypass'] }))).toBe(
      "['oryxa-prod'] | where evt == 'auth' and reason != 'logs_operator' and reason != 'dev_bypass' | sort by _time desc | limit 50",
    );
  });

  it('escapes a reason that tries to close the string', () => {
    process.env.AXIOM_DATASET = 'oryxa-prod';
    const apl = buildApl(filter({ evt: 'auth', notReasons: ["x' | count | '"] }));
    expect(apl).toBe(
      "['oryxa-prod'] | where evt == 'auth' and reason != 'x\\' | count | \\'' | sort by _time desc | limit 50",
    );
  });

  it('interpolates nothing but the dataset name and the enum member', () => {
    process.env.AXIOM_DATASET = "odd\\'name";
    const apl = buildApl(filter({ evt: 'req', limit: 7 }));
    expect(apl).toBe("['odd\\\\\\'name'] | where evt == 'req' | sort by _time desc | limit 7");
    expect(apl).not.toContain(WINDOW.startTime);
  });

  it('escapes a dataset name that tries to close the string', () => {
    process.env.AXIOM_DATASET = "x' | count | '";
    expect(buildApl(filter())).toBe("['x\\' | count | \\''] | sort by _time desc | limit 50");
  });
});

describe('the cursor codec', () => {
  it('round-trips an instant', () => {
    expect(decodeCursor(encodeCursor(WINDOW.startTime))).toBe(WINDOW.startTime);
  });

  it('normalises the instant it decodes', () => {
    expect(decodeCursor(encodeCursor('2026-10-01T12:00:00Z'))).toBe(WINDOW.startTime);
  });

  it('returns nothing for a cursor it did not issue', () => {
    for (const junk of ['', '!!!', 'bm90LWE=encodeable', 'Zm9vYmFy']) {
      expect(decodeCursor(junk), junk).toBeUndefined();
    }
  });
});

describe('which store answers', () => {
  afterEach(() => __testOnly.reset());

  it('is the in-process store while ingest is off', () => {
    __testOnly.setSink('stdout');
    expect(logQuerySource()).toBe('memory');
    __testOnly.setSink('none');
    expect(logQuerySource()).toBe('memory');
  });

  it('is Axiom once ingest is on', () => {
    __testOnly.setSink('axiom');
    expect(logQuerySource()).toBe('axiom');
  });

  it('keeps a fact in exactly one queryable place', async () => {
    __testOnly.setSink('axiom');
    __testOnly.setIngest(async () => undefined);
    emit('anomaly', { kind: 'claim_lost' });
    expect(storedEvents()).toEqual([]);
    expect(__testOnly.queueSize()).toBe(1);

    __testOnly.setSink('stdout');
    emit('anomaly', { kind: 'claim_lost' });
    expect(storedEvents()).toHaveLength(1);
    expect(__testOnly.queueSize()).toBe(1);
  });

  it('bounds the in-process store and drops the oldest', () => {
    process.env.LOG_STORE_MAX_EVENTS = '40';
    __testOnly.setSink('none');
    for (let i = 0; i < 120; i++) {
      emit('webhook_item', { kind: 'message', externalId: `mid_${i}` });
    }
    expect(__testOnly.storedSize()).toBeLessThanOrEqual(40);
    const ids = storedEvents().map((event) => event.externalId);
    expect(ids[0]).toBe('mid_119');
    expect(ids).not.toContain('mid_0');
    delete process.env.LOG_STORE_MAX_EVENTS;
  });
});

describe('the memory store behind the route', () => {
  /** `emit()` stamps the clock, so the seed times are reached by freezing it. */
  const at = (minutes: number) => new Date(Date.parse(WINDOW.startTime) + minutes * 60_000);
  const NOW = 55;

  function seed(minutes: number, fields: Record<string, unknown>): void {
    vi.setSystemTime(at(minutes));
    withContext(startContext({ requestId: `seed-${minutes}` }), () => {
      emit('db', { table: 'messages', operation: 'select', durationMs: minutes, ...fields });
    });
    vi.setSystemTime(at(NOW));
  }

  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('none');
    vi.useFakeTimers();
    vi.setSystemTime(at(NOW));
  });

  afterEach(() => {
    __testOnly.reset();
    vi.useRealTimers();
  });

  it('applies the window and the type, newest first', () => {
    seed(5, { rowCount: 1 });
    seed(20, { rowCount: 2 });
    emit('anomaly', { kind: 'double_send' });

    return queryLogs(filter({ evt: 'db' })).then((page) => {
      expect(page.source).toBe('memory');
      expect(page.events.map((row) => row.fields.rowCount)).toEqual([2, 1]);
      expect(page.events.every((row) => row.evt === 'db')).toBe(true);
      expect(page.window).toEqual(WINDOW);
    });
  });

  /**
   * The dashboard counts auth *rejections*, and every operator page load writes an
   * auth row saying they were let in — so the exclusion has to happen in the store
   * read, not after it, or the cap silently fills with successes.
   */
  it('leaves out the reasons the caller excludes', async () => {
    for (const [minutes, reason] of [
      [5, 'logs_operator'],
      [10, 'logs_not_allowlisted'],
      [15, 'dev_bypass'],
    ] as const) {
      vi.setSystemTime(at(minutes));
      withContext(startContext({ requestId: `seed-${minutes}` }), () => emit('auth', { reason }));
    }
    vi.setSystemTime(at(NOW));

    const page = await queryLogs(filter({ evt: 'auth', notReasons: ['logs_operator', 'dev_bypass'] }));
    expect(page.events.map((row) => row.fields.reason)).toEqual(['logs_not_allowlisted']);

    const everything = await queryLogs(filter({ evt: 'auth' }));
    expect(everything.events).toHaveLength(3);
  });

  it('lifts the time it stamps into the row and out of the fields', async () => {
    seed(5, {});
    const page = await queryLogs(filter());
    expect(page.events[0].time).toBe('2026-10-01T12:05:00.000Z');
    expect(page.events[0].fields.time).toBeUndefined();
    expect(page.events[0].fields.evt).toBeUndefined();
    expect(page.events[0].fields.requestId).toBe('seed-5');
  });

  it('ignores what it stamped outside the window', async () => {
    seed(5, {});
    seed(75, {});
    const page = await queryLogs(filter());
    expect(page.events.map((row) => row.time)).toEqual(['2026-10-01T12:05:00.000Z']);
  });

  it('offers a cursor only when older events remain', async () => {
    seed(5, {});
    const full = await queryLogs(filter({ limit: 1 }));
    expect(full.events).toHaveLength(1);
    expect(full.nextCursor).toBeUndefined();

    seed(20, {});
    const paged = await queryLogs(filter({ limit: 1 }));
    expect(paged.nextCursor).toBe(encodeCursor('2026-10-01T12:20:00.000Z'));
  });
});

describe('the Axiom provider', () => {
  type Call = { url: string; init: RequestInit };

  const saved = {
    dataset: process.env.AXIOM_DATASET,
    token: process.env.AXIOM_TOKEN,
    queryToken: process.env.AXIOM_QUERY_TOKEN,
  };

  /**
   * The client is built by the layer under test, so the stub sees the request the
   * SDK really sends rather than the one this file would send on its behalf.
   */
  function stubFetch(payload: string | (() => unknown), calls: Call[]): void {
    querySeam.setQueryFetch(async (input, init) => {
      calls.push({ url: String(input), init: (init ?? {}) as RequestInit });
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload());
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
  }

  beforeEach(() => {
    process.env.AXIOM_DATASET = 'oryxa-test';
    process.env.AXIOM_TOKEN = 'xaat-ingest-token';
    delete process.env.AXIOM_QUERY_TOKEN;
    querySeam.setQueryFetch(undefined);
    querySeam.setQueryClient(undefined);
    __testOnly.reset();
    __testOnly.setSink('axiom');
  });

  afterEach(() => {
    querySeam.setQueryFetch(undefined);
    querySeam.setQueryClient(undefined);
    __testOnly.reset();
    for (const [name, value] of Object.entries({
      AXIOM_DATASET: saved.dataset,
      AXIOM_TOKEN: saved.token,
      AXIOM_QUERY_TOKEN: saved.queryToken,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function match(
    time: string,
    data: Record<string, unknown>,
    rowId: string,
  ): Record<string, unknown> {
    return { _rowId: rowId, _sysTime: 'ignored', _time: time, data };
  }

  it('sends the APL, the window and the legacy format to the query endpoint', async () => {
    const calls: Call[] = [];
    stubFetch(() => ({ matches: [], status: {} }), calls);

    await queryLogs(filter({ evt: 'db', limit: 12 }));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/datasets/_apl');
    expect(calls[0].url).toContain('format=legacy');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer xaat-ingest-token');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      apl: buildApl(filter({ evt: 'db', limit: 12 })),
      startTime: WINDOW.startTime,
      endTime: WINDOW.endTime,
    });
  });

  it('maps what Axiom matched into rows, newest first', async () => {
    const calls: Call[] = [];
    stubFetch(
      () => ({
        matches: [
          match('2026-10-01T12:05:00.000Z', { evt: 'req', status: 200, path: '/a' }, 'a'),
          match('2026-10-01T12:40:00.000Z', { evt: 'req', status: 500, path: '/b' }, 'b'),
        ],
        status: { rowsMatched: 2 },
      }),
      calls,
    );

    const page = await queryLogs(filter({ evt: 'req' }));
    expect(page.source).toBe('axiom');
    expect(page.events.map((row: LogEventRow) => row.time)).toEqual([
      '2026-10-01T12:40:00.000Z',
      '2026-10-01T12:05:00.000Z',
    ]);
    expect(page.events[0].fields.status).toBe(500);
    expect(page.events[0].fields.evt).toBeUndefined();
    expect(page.nextCursor).toBeUndefined();
  });

  it('leaves out the fields this event never wrote', async () => {
    const calls: Call[] = [];
    // Axiom answers every dataset field, nulls included, for the ones absent here.
    stubFetch(
      () => ({
        matches: [
          match('2026-10-01T12:40:00.000Z', {
            evt: 'auth',
            reason: 'missing',
            status: null,
            path: null,
            durationMs: null,
            replyText: undefined,
          }, 'a'),
        ],
        status: {},
      }),
      calls,
    );

    const page = await queryLogs(filter({ evt: 'auth' }));
    expect(page.events[0].fields).toEqual({ reason: 'missing' });
  });

  it('pages from the oldest time it returned', async () => {
    const calls: Call[] = [];
    stubFetch(
      () => ({
        matches: [10, 20, 30, 40].map((minute) =>
          match(
            new Date(Date.parse(WINDOW.startTime) + minute * 60_000).toISOString(),
            { evt: 'db', minute },
            `r${minute}`,
          ),
        ),
        status: {},
      }),
      calls,
    );

    const page = await queryLogs(filter({ limit: 2 }));
    expect(page.events.map((row) => row.fields.minute)).toEqual([40, 30]);
    expect(page.nextCursor).toBe(encodeCursor('2026-10-01T12:30:00.000Z'));

    const next = decodeCursor(page.nextCursor as string);
    expect(next).toBe('2026-10-01T12:30:00.000Z');
  });

  it('rejects rather than answering empty when Axiom says no', async () => {
    querySeam.setQueryFetch(async () =>
      new Response('{"message":"dataset not found"}', { status: 404 }),
    );

    await expect(queryLogs(filter())).rejects.toThrow(/dataset not found/);
  });

  it('reads a token of its own when one is configured', async () => {
    process.env.AXIOM_QUERY_TOKEN = 'xaat-read-token';
    querySeam.setQueryFetch(undefined);
    const calls: Call[] = [];
    stubFetch(() => ({ matches: [], status: {} }), calls);

    await queryLogs(filter());

    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer xaat-read-token',
    );
  });
});
