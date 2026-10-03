import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { instrumentSql, setDatabaseLogSink } from '@repo/db/query-log';
import { emitDbSummary, wireDatabaseLogging } from '@api/lib/db-log';
import { storedEvents, __testOnly as logging } from '@api/lib/log';
import { startContext, withContext, type LogContext } from '@api/lib/ctx';

type Fields = Record<string, unknown>;

const SELECT = `select "messages"."id", "messages"."body" from "messages" where "messages"."conversation_id" = $1`;

interface Fake {
  sql: (...args: unknown[]) => unknown;
  calls: unknown[][];
  reports: Fields[];
}

/** A stand-in for the function `neon()` returns: callable, with own properties. */
function fakeClient(behaviour: (...args: unknown[]) => unknown): Fake {
  const calls: unknown[][] = [];
  const inner = Object.assign(
    function (this: unknown, ...args: unknown[]) {
      calls.push(args);
      return behaviour.apply(this, args);
    },
    { transaction: (queries: unknown) => ({ queued: queries }), count: 3 },
  );
  const reports: Fields[] = [];
  setDatabaseLogSink((fields) => reports.push(fields));
  return { sql: instrumentSql(inner) as (...args: unknown[]) => unknown, calls, reports };
}

function recording(): Fields[] {
  const reports: Fields[] = [];
  setDatabaseLogSink((fields) => reports.push(fields));
  return reports;
}

/** The three-argument call drizzle's neon-http session makes, so the wrapper is driven as the app drives it. */
function wrap<T>(behaviour: () => T): (sql?: unknown, params?: unknown, config?: unknown) => T {
  return instrumentSql(behaviour) as (sql?: unknown, params?: unknown, config?: unknown) => T;
}

describe('the query instrument', () => {
  afterEach(() => setDatabaseLogSink(undefined));

  it('is inert until the API wires a sink', () => {
    setDatabaseLogSink(undefined);
    const value = [{ id: 1 }];
    const wrapped = wrap(() => value);

    expect(wrapped()).toBe(value);
  });

  it('hands the inner value back by identity, so drizzle sees its own promise', async () => {
    const promise = Promise.resolve([{ id: 1 }]);
    const wrapped = wrap(() => promise);
    expect(wrapped(SELECT)).toBe(promise);
    await expect(promise).resolves.toEqual([{ id: 1 }]);
  });

  it('passes the receiver and every argument through untouched', async () => {
    const receiver = { name: 'neon' };
    const params = ['conversation-1'];
    const config = { method: 'POST' };
    const fake = fakeClient(function (this: unknown) {
      return (this as { name?: string } | undefined)?.name;
    });
    const returned = fake.sql.call(receiver, SELECT, params, config);
    await Promise.resolve();

    expect(returned).toBe('neon');
    expect(fake.calls).toEqual([[SELECT, params, config]]);
  });

  it('keeps the own properties drizzle calls on the same function', () => {
    const fake = fakeClient(() => []);
    expect(typeof fake.sql).toBe('function');
    expect((fake.sql as unknown as { transaction: (q: unknown) => unknown }).transaction([1])).toEqual({
      queued: [1],
    });
    expect((fake.sql as unknown as { count: number }).count).toBe(3);
  });

  it('names the verb and the table, and never repeats the statement', async () => {
    const reports = recording();
    const wrapped = instrumentSql(
      () => Promise.resolve([{ body: 'customer text that must not be logged' }]),
    ) as (sql: string) => Promise<unknown>;
    await wrapped(`${SELECT} and "messages"."body" = 'customer text that must not be logged'`);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ operation: 'select', table: 'messages', rowCount: 1 });
    expect(JSON.stringify(reports)).not.toContain('customer text');
    expect(JSON.stringify(reports)).not.toContain('select "messages"');
  });

  it('counts rows from both shapes the driver returns', async () => {
    const reports = recording();
    const array = wrap(() => Promise.resolve([1, 2, 3]));
    const result = wrap(() => Promise.resolve({ rows: [{}, {}] }));
    await array('select 1');
    await result('select 1');

    expect(reports.map((report) => report.rowCount)).toEqual([3, 2]);
  });

  it('reports a rejection without absorbing it', async () => {
    const reports = recording();
    const boom = new Error('connection reset');
    const wrapped = wrap(() => Promise.reject(boom));

    await expect(wrapped('select 1')).rejects.toBe(boom);
    expect(reports[0].errorName).toBe('Error');
    expect(reports[0].rowCount).toBeUndefined();
  });

  it('reports a synchronous throw and still raises it', () => {
    const reports = recording();
    const boom = new TypeError('bad config');
    const wrapped = wrap(() => {
      throw boom;
    });

    expect(() => wrapped('update "orders" set x = 1')).toThrow(TypeError);
    expect(reports[0]).toMatchObject({ operation: 'update', table: 'orders', errorName: 'TypeError' });
  });

  it('cannot fail a query through the line describing it', async () => {
    setDatabaseLogSink(() => {
      throw new Error('the log itself exploded');
    });
    const wrapped = wrap(() => Promise.resolve([{ id: 1 }]));

    await expect(wrapped(SELECT)).resolves.toEqual([{ id: 1 }]);
  });

  it('measures how long the call took', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_123.45);
    const reports = recording();
    const wrapped = wrap(() => Promise.resolve([]));
    await wrapped('select 1');

    expect(reports[0].durationMs).toBe(123.5);
    vi.restoreAllMocks();
  });
});

describe('what the API decides to keep', () => {
  const saved = { sample: process.env.LOG_DB_SAMPLE, slow: process.env.SLOW_DB_MS };
  let context: LogContext;

  beforeEach(() => {
    logging.reset();
    logging.setSink('none');
    process.env.LOG_DB_SAMPLE = '0';
    process.env.SLOW_DB_MS = '200';
    wireDatabaseLogging();
    context = startContext({ requestId: 'request-db' });
  });

  afterEach(() => {
    setDatabaseLogSink(undefined);
    logging.reset();
    vi.restoreAllMocks();
    if (saved.sample === undefined) delete process.env.LOG_DB_SAMPLE;
    else process.env.LOG_DB_SAMPLE = saved.sample;
    if (saved.slow === undefined) delete process.env.SLOW_DB_MS;
    else process.env.SLOW_DB_MS = saved.slow;
  });

  function events(evt: string): Fields[] {
    return storedEvents().filter((event) => event.evt === evt);
  }

  async function run(sql = SELECT): Promise<void> {
    const wrapped = wrap(() => Promise.resolve([{ id: 1 }]));
    await wrapped(sql);
  }

  it('thins ordinary queries but still counts every one of them', async () => {
    await withContext(context, async () => {
      await run();
      await run('select * from "conversations"');
      await run('update "orders" set status = $1');
      emitDbSummary();
    });

    expect(events('db')).toEqual([]);
    const summary = events('db_summary');
    expect(summary).toHaveLength(3);
    expect(summary.map((row) => row.table).sort()).toEqual(['conversations', 'messages', 'orders']);
    expect(summary.find((row) => row.table === 'messages')?.count).toBe(1);
  });

  it('keeps every failure whatever the sample says', async () => {
    await withContext(context, async () => {
      const wrapped = wrap(() => Promise.reject(new Error('deadbolt')));
      await expect(wrapped('select 1 from "messages"')).rejects.toThrow('deadbolt');
    });

    const rows = events('db');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'messages', operation: 'select', errorName: 'Error' });
    expect(rows[0].slow).toBe(false);
  });

  it('keeps a slow query and marks it as one', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(640);
    await withContext(context, async () => {
      await run();
    });

    const rows = events('db');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slow: true, durationMs: 640 });
  });

  it('keeps everything once the sample dial is open', async () => {
    process.env.LOG_DB_SAMPLE = '100';
    await withContext(context, async () => {
      await run();
      await run('delete from "posts"');
    });

    expect(events('db').map((row) => row.table)).toEqual(['posts', 'messages']);
  });

  it('reports each rollup once and then has nothing left to say', async () => {
    await withContext(context, async () => {
      await run();
      await run();
      emitDbSummary();
      emitDbSummary();
    });

    expect(events('db_summary')).toHaveLength(1);
    expect(events('db_summary')[0]).toMatchObject({ table: 'messages', count: 2 });
  });

  it('counts nothing outside a request, so a script costs no tally', async () => {
    await run();
    emitDbSummary();

    expect(events('db')).toEqual([]);
    expect(events('db_summary')).toEqual([]);
  });

  it('rounds the total it reports', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(12.34);
    await withContext(context, async () => {
      await run('select 1 from "users"');
      emitDbSummary();
    });

    expect(events('db_summary')[0].totalMs).toBe(12.3);
  });

  it('stamps the request it ran for onto every db row', async () => {
    process.env.LOG_DB_SAMPLE = '100';
    await withContext(context, async () => {
      await run();
    });

    expect(events('db')[0].requestId).toBe('request-db');
  });
});
