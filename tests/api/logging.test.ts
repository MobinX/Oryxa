import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { app } from '@api/app';
import { logRequest, handleError, handleNotFound } from '@api/lib/logmiddleware';
import { flush, __testOnly } from '@api/lib/log';

type Event = Record<string, unknown>;

let batches: Event[][] = [];

function events(): Event[] {
  return batches.flat();
}

/** Structural so both Hono and OpenAPIHono fit without a cast. */
type Requestable = {
  request(input: string, init?: RequestInit): Response | Promise<Response>;
};

/** Sends the request, then drains the queue so assertions see settled events. */
async function call(target: Requestable, path: string, init?: RequestInit): Promise<Response> {
  const res = await target.request(path, init);
  await flush();
  return res;
}

/** Middleware must be registered before the routes, exactly as app.ts does. */
function baseApp(instrumented: boolean): Hono {
  const probe = new Hono();
  if (instrumented) {
    probe.use('*', logRequest);
    probe.onError(handleError);
    probe.notFound(handleNotFound);
  }
  probe.get('/boom', () => {
    throw new Error('kaboom');
  });
  probe.get('/bad-request', () => {
    throw new HTTPException(400, { message: 'explicit rejection' });
  });
  probe.get('/gone', (c: Context) => c.text('gone', 404));
  probe.get('/fine', (c: Context) => c.json({ ok: true }));
  return probe;
}

function probeApp(): Hono {
  return baseApp(true);
}

function controlApp(): Hono {
  return baseApp(false);
}

async function snapshot(res: Response) {
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    body: await res.text(),
  };
}

beforeEach(() => {
  __testOnly.reset();
  __testOnly.setSink('axiom');
  batches = [];
  __testOnly.setIngest((next) => {
    batches.push(next);
    return Promise.resolve();
  });
});

afterEach(() => {
  __testOnly.reset();
});

describe('the response contract is untouched', () => {
  it('reproduces Hono default responses byte for byte', async () => {
    for (const path of ['/fine', '/boom', '/bad-request', '/gone', '/never-matched']) {
      const logged = await snapshot(await probeApp().request(path));
      const plain = await snapshot(await controlApp().request(path));
      expect(logged).toEqual(plain);
    }
  });

  it('adds no response header of its own', async () => {
    const res = await call(app, '/');
    for (const header of ['x-request-id', 'x-run-id', 'x-run-depth', 'x-trace-id']) {
      expect(res.headers.get(header)).toBeNull();
    }
    expect(await res.clone().json()).toEqual({ name: 'Oryxa API', version: '1.0.0' });
  });

  it('still answers an unmatched route with the default 404 body', async () => {
    const res = await call(app, '/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('404 Not Found');
  });
});

describe('one event per request', () => {
  it('emits exactly one evt=req carrying the outcome', async () => {
    const res = await call(app, '/');
    expect(res.status).toBe(200);
    const reqs = events().filter((e) => e.evt === 'req');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ method: 'GET', path: '/', status: 200 });
    expect(typeof reqs[0].durationMs).toBe('number');
    expect(typeof reqs[0].requestId).toBe('string');
    expect(typeof reqs[0].runId).toBe('string');
  });

  it('emits one evt=not_found and no evt=req for an unmatched route', async () => {
    await call(app, '/definitely-not-a-route');
    expect(events().map((e) => e.evt)).toEqual(['not_found']);
  });

  it('keeps evt=req for a route that answers 404 itself', async () => {
    await call(probeApp(), '/gone');
    expect(events().map((e) => e.evt)).toEqual(['req']);
    expect(events()[0]).toMatchObject({ status: 404, routePath: '/gone' });
  });

  it('emits one evt=error plus one evt=req when a handler throws', async () => {
    await call(probeApp(), '/boom');
    const errors = events().filter((e) => e.evt === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ name: 'Error', message: 'kaboom' });
    expect(errors[0]).not.toHaveProperty('path');
    expect(errors[0]).not.toHaveProperty('status');
    expect(events().filter((e) => e.evt === 'req')).toHaveLength(1);
  });

  it('makes no ingest request for a request that logged nothing', async () => {
    const res = await call(app, '/api/v1/users/me', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3400', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.status).toBeLessThan(300);
    expect(batches).toHaveLength(0);
  });
});

describe('correlation', () => {
  it('adopts the run id and depth handed over by the runner', async () => {
    await call(app, '/', { headers: { 'x-run-id': 'run-abc-123', 'x-run-depth': '3' } });
    expect(events().find((e) => e.evt === 'req')).toMatchObject({ runId: 'run-abc-123', runDepth: 3 });
  });

  it('refuses a malformed run id instead of poisoning the trace', async () => {
    await call(app, '/', { headers: { 'x-run-id': '../../etc/passwd' } });
    const req = events().find((e) => e.evt === 'req');
    expect(typeof req?.runId).toBe('string');
    expect(req?.runId).not.toContain('..');
    expect(req?.runId).not.toContain('/');
  });

  it('stamps the same requestId on every event of one request', async () => {
    await call(app, '/api/v1/users/me');
    const all = events();
    expect(new Set(all.map((e) => e.requestId)).size).toBe(1);
    expect(all.map((e) => e.evt).sort()).toEqual(['auth', 'req']);
  });
});

describe('auth rejections', () => {
  it('records why a request was rejected, without repeating the request facts', async () => {
    const res = await call(app, '/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(await res.clone().json()).toEqual({ error: 'Unauthorized' });
    const auth = events().find((e) => e.evt === 'auth');
    expect(auth).toMatchObject({ reason: 'missing' });
    for (const repeated of ['path', 'method', 'status', 'routePath', 'durationMs']) {
      expect(auth).not.toHaveProperty(repeated);
    }
  });

  it('distinguishes a non-bearer header from no header at all', async () => {
    await call(app, '/api/v1/users/me', { headers: { Authorization: 'Token abc' } });
    expect(events().find((e) => e.evt === 'auth')).toMatchObject({ reason: 'not_bearer' });
  });

  it('flags the dev token even where it is refused', async () => {
    const res = await call(app, '/api/v1/users/me', { headers: { Authorization: 'Bearer dev-test-token' } });
    expect(events().filter((e) => e.evt === 'auth').map((e) => e.reason)).toContain('dev_bypass');
    expect(res.status).toBeLessThanOrEqual(503);
  });
});
