import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { LOG_CORPUS, type Fields } from '../helpers/log-corpus';
import { logsRouter } from '@api/routes/logs';
import { logsAccessMiddleware, logsOperatorUser } from '@api/middleware/logs-access';
import { logRequest } from '@api/lib/logmiddleware';
import { emit, flush, storedEvents, __testOnly } from '@api/lib/log';
import { startContext, withContext } from '@api/lib/ctx';
import { LOG_EVENT_TYPES, type LogEventType } from '@repo/shared';
import { encodeCursor } from '@api/lib/log-query';

vi.mock('@repo/db/crud/user', () => ({
  getUserByFirebaseUid: async () => ({
    id: 'user-1',
    firebaseUid: 'dev-test-uid',
    name: 'Test User',
    email: null,
  }),
}));

const BASE_ISO = '2026-10-01T12:00:00.000Z';
const BASE = Date.parse(BASE_ISO);
/** The frozen "now" of a test: after every seeded event, before every query. */
const NOW_MINUTES = 50;

/** The clock is frozen per event, so a query window can be written as a literal. */
function atMinutes(minutes: number): Date {
  return new Date(BASE + minutes * 60_000);
}

function probe(): Hono {
  const app = new Hono();
  app.use('*', logRequest);
  app.route('/api2', logsRouter);
  return app;
}

async function get(target: Hono, search: string): Promise<Response> {
  const res = await target.request(`http://localhost/api2/logs${search}`, {
    headers: { Authorization: 'Bearer dev-test-token' },
  });
  await flush();
  return res;
}

async function body(target: Hono, search: string): Promise<Record<string, unknown>> {
  return (await get(target, search)).json() as Promise<Record<string, unknown>>;
}

type Row = { time: string; evt: string; fields: Record<string, unknown> };

function rows(payload: Record<string, unknown>): Row[] {
  return payload.events as Row[];
}

function evts(payload: Record<string, unknown>): string[] {
  return rows(payload).map((row) => row.evt);
}

/** Seeds put the clock forward, so the request itself is stamped after them all. */
const WINDOW = `?start=${BASE_ISO}&end=${new Date(BASE + 3_600_000).toISOString()}`;

describe('GET /api2/logs', () => {
  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('none');
    vi.useFakeTimers();
    vi.setSystemTime(atMinutes(NOW_MINUTES));
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_QUERY_USER_IDS;
  });

  afterEach(() => {
    vi.useRealTimers();
    __testOnly.reset();
    delete process.env.LOG_QUERY_USER_IDS;
  });

  it('returns one row of every event type the logger can emit', async () => {
    LOG_CORPUS.forEach((sample, index) => emitAt(sample.evt, sample.fields, index + 1));

    const payload = await body(probe(), WINDOW);
    expect(payload.source).toBe('memory');
    expect(payload.limit).toBe(50);

    const seen = new Set(evts(payload));
    for (const type of LOG_EVENT_TYPES) {
      expect(seen.has(type), `missing evt=${type}`).toBe(true);
    }
    expect(seen.size).toBe(LOG_EVENT_TYPES.length);
  });

  it('filters by the type field', async () => {
    emitAt('db', { table: 'conversations', operation: 'select', durationMs: 31.5, rowCount: 4 }, 1);
    emitAt('db', { table: 'messages', operation: 'insert', durationMs: 8, rowCount: 1 }, 2);
    emitAt('anomaly', { kind: 'claim_lost' }, 3);

    const payload = await body(probe(), `${WINDOW}&type=db`);
    expect(rows(payload)).toHaveLength(2);
    expect(evts(payload)).toEqual(['db', 'db']);
    expect(rows(payload)[0].fields.table).toBe('messages');
  });

  it('treats the empty type a browser form submits as no filter', async () => {
    emitAt('db', { table: 'messages', operation: 'select', durationMs: 4, rowCount: 1 }, 1);
    emitAt('anomaly', { kind: 'claim_lost' }, 2);

    const payload = await body(probe(), `${WINDOW}&type=`);
    const seen = new Set(evts(payload));
    expect(seen.has('db')).toBe(true);
    expect(seen.has('anomaly')).toBe(true);
  });

  it('accepts a start with no end, paging from there to now', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, 1);
    emitAt('anomaly', { kind: 'double_send' }, 30);

    const payload = await body(probe(), `?start=${new Date(BASE + 20 * 60_000).toISOString()}`);
    expect(evts(payload)).toEqual(['anomaly']);
    expect(rows(payload)[0].fields.kind).toBe('double_send');
  });

  it('accepts an end with no start, defaulting the window to one hour back', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, 1);
    emitAt('anomaly', { kind: 'double_send' }, 30);

    const end = new Date(BASE + 10 * 60_000).toISOString();
    const payload = await body(probe(), `?end=${end}`);
    expect(rows(payload)).toHaveLength(1);
    expect(rows(payload)[0].fields.kind).toBe('claim_lost');
    const window = payload.window as { startTime: string; endTime: string };
    expect(Date.parse(window.endTime)).toBe(Date.parse(end));
    expect(Date.parse(window.endTime) - Date.parse(window.startTime)).toBe(60 * 60_000);
  });

  it('keeps paging backwards when the caller bounded only the newest end', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, -90);
    emitAt('anomaly', { kind: 'double_send' }, -75);

    const app = probe();
    // The default hour holds nothing, and an empty hour is a step, not a dead end.
    const first = await body(app, `?end=${BASE_ISO}`);
    expect(rows(first)).toEqual([]);
    const window = first.window as { startTime: string };
    expect(first.nextCursor).toBe(encodeCursor(window.startTime));

    const second = await body(app, `?end=${BASE_ISO}&cursor=${first.nextCursor}`);
    expect(rows(second).map((row) => row.fields.kind)).toEqual(['double_send', 'claim_lost']);
    // Older history exists, so this window offers its own start as the next bound.
    expect(second.nextCursor).toBe(encodeCursor((second.window as { startTime: string }).startTime));
  });

  it('does not walk past a start the caller named', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, -90);

    const payload = await body(
      probe(),
      `?start=${BASE_ISO}&end=${new Date(BASE + 5 * 60_000).toISOString()}`,
    );
    expect(rows(payload)).toEqual([]);
    expect(payload.nextCursor).toBeUndefined();
  });

  it('honours both bounds at once', async () => {
    for (const [index, kind] of ['a', 'b', 'c', 'd'].entries()) {
      emitAt('anomaly', { kind: `claim_lost`, detail: kind }, index * 10 + 5);
    }

    const payload = await body(
      probe(),
      `?start=${new Date(BASE + 10 * 60_000).toISOString()}&end=${new Date(BASE + 20 * 60_000).toISOString()}`,
    );
    expect(rows(payload)).toHaveLength(1);
    expect(rows(payload)[0].fields.detail).toBe('b');
  });

  it('pages older events with an opaque cursor and never repeats one', async () => {
    for (let i = 0; i < 5; i++) {
      emitAt('webhook_item', { kind: 'message', externalId: `mid_${i}`, outcome: 'agent_triggered' }, i + 1);
    }

    const app = probe();
    const first = await body(app, `${WINDOW}&type=webhook_item&limit=2`);
    expect(rows(first).map((row) => row.fields.externalId)).toEqual(['mid_4', 'mid_3']);
    expect(first.nextCursor).toBe(encodeCursor(rows(first)[1].time));

    const second = await body(app, `${WINDOW}&type=webhook_item&limit=2&cursor=${first.nextCursor}`);
    expect(rows(second).map((row) => row.fields.externalId)).toEqual(['mid_2', 'mid_1']);

    const third = await body(app, `${WINDOW}&type=webhook_item&limit=2&cursor=${second.nextCursor}`);
    expect(rows(third).map((row) => row.fields.externalId)).toEqual(['mid_0']);
    expect(third.nextCursor).toBeUndefined();

    const all = rows(first).concat(rows(second), rows(third)).map((row) => row.fields.externalId);
    expect(new Set(all).size).toBe(5);
  });

  it('rejects a cursor it did not issue', async () => {
    const res = await get(probe(), `${WINDOW}&cursor=not-a-cursor`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid cursor' });
  });

  it('rejects an unrecordable type instead of returning everything', async () => {
    const res = await get(probe(), `${WINDOW}&type=password`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Invalid query — check type, start, end, limit and cursor',
    });
  });

  it('rejects malformed bounds and limits', async () => {
    expect((await get(probe(), `${WINDOW}&start=yesterday`)).status).toBe(400);
    expect((await get(probe(), `${WINDOW}&end=tomorrow`)).status).toBe(400);
    expect((await get(probe(), `${WINDOW}&limit=0`)).status).toBe(400);
    expect((await get(probe(), `${WINDOW}&limit=many`)).status).toBe(400);
  });

  it('caps the page size rather than failing a UI that asked for too much', async () => {
    const payload = await body(probe(), `${WINDOW}&limit=100000`);
    expect(payload.limit).toBe(200);
  });

  it('refuses a window wider than the retention it cannot satisfy', async () => {
    const res = await get(
      probe(),
      `?start=${new Date(BASE - 120 * 86_400_000).toISOString()}&end=${new Date(BASE - 60 * 86_400_000).toISOString()}`,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/days maximum/);
  });

  it('reads a timezone-less datetime bound as UTC', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, 90);

    const payload = await body(probe(), '?start=2026-10-01T13:00&end=2026-10-01T14:00');
    expect(rows(payload)).toHaveLength(1);
  });

  it('returns an empty page when the window holds nothing, including past its own start', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, 1);

    const payload = await body(probe(), `${WINDOW}&cursor=${encodeCursor(BASE_ISO)}`);
    expect(rows(payload)).toEqual([]);
    expect(payload.nextCursor).toBeUndefined();
  });

  it('logs the query itself exactly once, and never before answering it', async () => {
    emitAt('anomaly', { kind: 'claim_lost' }, 1);

    const payload = await body(probe(), `${WINDOW}&type=req`);
    expect(rows(payload)).toEqual([]);

    const second = await body(probe(), `${WINDOW}&type=req`);
    expect(rows(second)).toHaveLength(1);
    expect(rows(second)[0].fields.path).toBe('/api2/logs');
  });

  it('exposes the event types the UI needs to offer', async () => {
    const res = await probe().request('http://localhost/api2/logs/types', {
      headers: { Authorization: 'Bearer dev-test-token' },
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { types: Array<{ evt: string; label: string }> };
    expect(payload.types.map((type) => type.evt)).toEqual([...LOG_EVENT_TYPES]);
    expect(payload.types.find((type) => type.evt === 'agent_run')?.label).toBe('Agent run outcome');
  });
});

describe('GET /api2/logs access control', () => {
  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('none');
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_QUERY_USER_IDS;
    delete process.env.LOGS_UI_PASSWORD;
    delete process.env.LOGS_UI_USER;
  });

  afterEach(() => {
    __testOnly.reset();
    delete process.env.LOG_QUERY_USER_IDS;
    delete process.env.LOGS_UI_PASSWORD;
    delete process.env.LOGS_UI_USER;
    process.env.NODE_ENV = 'test';
  });

  function withBearer(token: string): Headers {
    return new Headers({ Authorization: `Bearer ${token}` });
  }

  async function hit(app: Hono, headers?: Headers): Promise<Response> {
    const res = await app.request('http://localhost/api2/logs', { headers });
    await flush();
    return res;
  }

  it('refuses an anonymous caller', async () => {
    expect((await hit(probe())).status).toBe(401);
  });

  it('lets a caller whose id is allowlisted through', async () => {
    process.env.LOG_QUERY_USER_IDS = 'other-user, user-1';
    expect((await hit(probe(), withBearer('dev-test-token'))).status).toBe(200);
  });

  it('is open to the dev token while no allowlist is configured outside production', async () => {
    expect((await hit(probe(), withBearer('dev-test-token'))).status).toBe(200);
  });

  it('admits the console password where no allowlist and no production token would be', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOGS_UI_PASSWORD = 'console-s3cret';

    const res = await hit(probe(), withBearer('console-s3cret'));
    expect(res.status).toBe(200);
    expect(storedEvents().find((event) => event.evt === 'auth')?.reason).toBe('logs_operator');
  });

  it('refuses a near miss on the console password', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOGS_UI_PASSWORD = 'console-s3cret';

    const res = await hit(probe(), withBearer('console-s3cre'));
    expect(res.ok).toBe(false);
    expect(storedEvents().some((event) => event.evt === 'auth' && event.reason === 'logs_operator')).toBe(false);
  });

  it('has no console path in production until a password is configured', async () => {
    process.env.NODE_ENV = 'production';

    const res = await hit(probe(), withBearer('admin123'));
    expect(res.ok).toBe(false);
  });

  it('accepts the admin123 defaults outside production', async () => {
    const res = await hit(probe(), withBearer('admin123'));
    expect(res.status).toBe(200);
    expect(storedEvents().find((event) => event.evt === 'auth')?.reason).toBe('logs_operator');
  });

  it('reads the operator name from LOGS_UI_USER', () => {
    process.env.LOGS_UI_USER = ' ops ';
    expect(logsOperatorUser()).toBe('ops');
  });
});

describe('logs access guard', () => {
  beforeEach(() => {
    __testOnly.reset();
    __testOnly.setSink('none');
    delete process.env.LOG_QUERY_USER_IDS;
  });

  afterEach(() => {
    __testOnly.reset();
    delete process.env.LOG_QUERY_USER_IDS;
    process.env.NODE_ENV = 'test';
  });

  /** The guard alone: the production branch and the auth bypass cannot share a process.env.NODE_ENV. */
  function guarded(userId?: string): Hono {
    const app = new Hono();
    if (userId) {
      app.use('*', (c, next) => {
        c.set('user', { id: userId, firebaseUid: 'dev-test-uid', name: 'Test User' });
        return next();
      });
    }
    app.use('*', logsAccessMiddleware);
    app.get('/guarded', (c) => c.json({ ok: true }));
    return app;
  }

  async function hit(app: Hono): Promise<Response> {
    const res = await app.request('http://localhost/guarded');
    await flush();
    return res;
  }

  it('holds the door shut in production when nothing is allowlisted', async () => {
    process.env.NODE_ENV = 'production';
    expect((await hit(guarded('user-1'))).status).toBe(403);
  });

  it('refuses a signed-in caller outside the allowlist, and records why', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_QUERY_USER_IDS = 'another-user, third-user';

    const res = await hit(guarded('user-1'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"error":"Forbidden"}');

    const denial = storedEvents().find((event) => event.evt === 'auth');
    expect(denial?.reason).toBe('logs_not_allowlisted');
    expect(denial?.uid).toBe('dev-test-uid');
  });

  it('records a request that reached the guard with no user at all', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_QUERY_USER_IDS = 'user-1';

    expect((await hit(guarded())).status).toBe(403);
    expect(storedEvents().find((event) => event.evt === 'auth')?.reason).toBe('logs_anonymous');
  });

  it('admits an allowlisted id in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_QUERY_USER_IDS = 'user-1';
    expect((await hit(guarded('user-1'))).status).toBe(200);
  });
});

function emitAt(evt: LogEventType, fields: Fields, minutes: number): void {
  vi.setSystemTime(atMinutes(minutes));
  withContext(startContext({ requestId: `seed-${evt}-${minutes}` }), () => emit(evt, fields));
  vi.setSystemTime(atMinutes(NOW_MINUTES));
}
