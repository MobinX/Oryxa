import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loggedFetch,
  loggedCall,
  logGraphSendFailure,
  setIntegrationLogSink,
} from '@repo/integrations/http-log';
import { emit, flush, __testOnly } from '@api/lib/log';
import { startContext, withContext } from '@api/lib/ctx';

type Event = Record<string, unknown>;

let batches: Event[][] = [];

const events = () => batches.flat();
const of = (evt: string) => events().filter((e) => e.evt === evt);

beforeEach(() => {
  __testOnly.reset();
  __testOnly.setSink('axiom');
  batches = [];
  __testOnly.setIngest((next) => {
    batches.push([...next]);
    return Promise.resolve();
  });
  setIntegrationLogSink((evt, fields) => emit(evt, fields));
});

afterEach(() => {
  setIntegrationLogSink(undefined);
  __testOnly.reset();
  vi.unstubAllGlobals();
});

describe('outbound calls reported by the integrations package', () => {
  it('logs the host and path of a Graph URL, never the access_token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));

    const res = await loggedFetch(
      'https://graph.facebook.com/v21.0/me/messages?access_token=EAASECRET123&recipient=1',
      { method: 'POST' },
    );
    await flush();

    expect(res.status).toBe(200);
    expect(of('http_out')).toHaveLength(1);
    expect(of('http_out')[0]).toMatchObject({
      host: 'graph.facebook.com',
      targetPath: '/v21.0/me/messages',
      httpMethod: 'POST',
      service: 'facebook',
      status: 200,
      ok: true,
    });
    expect(typeof of('http_out')[0].durationMs).toBe('number');
    expect(JSON.stringify(events())).not.toContain('EAASECRET123');
  });

  it('reports a network failure and rethrows the same error', async () => {
    const failure = new Error('socket closed');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw failure;
    }));

    await expect(loggedFetch('https://graph.facebook.com/v21.0/me')).rejects.toBe(failure);
    await flush();

    expect(of('http_out')).toMatchObject([
      { host: 'graph.facebook.com', ok: false, errorName: 'Error' },
    ]);
    // No response, so no status to claim.
    expect(of('http_out')[0]).not.toHaveProperty('status');
  });

  it('pairs one call with one event even when the same endpoint is hit twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));

    await loggedFetch('https://graph.facebook.com/v21.0/123/feed', { method: 'POST' });
    await loggedFetch('https://graph.facebook.com/v21.0/123/feed', { method: 'POST' });
    await flush();

    // Two calls are two facts; the dedupe set only collapses repeated *claims*.
    expect(of('http_out')).toHaveLength(2);
    expect(of('http_out').every((e) => e.status === 429 && e.ok === false)).toBe(true);
  });

  it('names the Graph code and subcode that stopped a reply reaching a customer', async () => {
    // Inside one invocation context, so the dedupe set is active: two different
    // reasons are two facts, and a repeated reason would still collapse to one.
    await withContext(startContext(), async () => {
      logGraphSendFailure(400, 10, 10011);
      logGraphSendFailure(400, 10, 10011);
      logGraphSendFailure(500);
      await flush();
    });

    expect(of('anomaly')).toMatchObject([
      { kind: 'graph_send_failed', detail: '10:10011' },
      { kind: 'graph_send_failed', detail: 'HTTP 500' },
    ]);
  });

  it('reports an SDK call that is not an HTTP fetch of ours', async () => {
    const result = await loggedCall('b2', 'PutObject', async () => 7);
    await expect(
      loggedCall('b2', 'GetObject', async () => {
        throw new Error('AccessDenied');
      }),
    ).rejects.toThrow('AccessDenied');
    await flush();

    expect(result).toBe(7);
    expect(of('http_out')).toMatchObject([
      { service: 'b2', targetPath: 'PutObject', httpMethod: 'SDK', ok: true },
      { service: 'b2', targetPath: 'GetObject', httpMethod: 'SDK', ok: false, errorName: 'Error' },
    ]);
  });

  it('still makes the call with no sink registered, and logs nothing', async () => {
    setIntegrationLogSink(undefined);
    const fetchMock = vi.fn(async () => new Response('body', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await loggedFetch('https://graph.facebook.com/v21.0/me/subscribed_apps', { method: 'POST' });
    logGraphSendFailure(400, 190);
    await flush();

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events()).toHaveLength(0);
  });
});
