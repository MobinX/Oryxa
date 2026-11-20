import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// The route captures the API host at module scope, so pin it before importing the module.
process.env.NEXT_PUBLIC_API_URL = 'http://api.test';

type RouteModule = typeof import('../../apps/web/app/api/ext-service/[[...route]]/route');

let route: RouteModule;

beforeAll(async () => {
  route = await import('../../apps/web/app/api/ext-service/[[...route]]/route');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function stubFetch(response: Response) {
  const mock = vi.fn(async () => response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function callOf(mock: ReturnType<typeof vi.fn>): { url: string; init?: RequestInit } {
  const [url, init] = mock.mock.calls[0] as [string, RequestInit?];
  return { url, init };
}

describe('Web /api/ext-service proxy', () => {
  it('forwards GET path and query to the API and returns its body', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await route.GET(new Request('http://web.local/api/ext-service/all?page=2&limit=5'));

    const { url, init } = callOf(fetchMock);
    expect(url).toBe('http://api.test/api/ext-service/all?page=2&limit=5');
    expect(init?.method).toBe('GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it('forwards POST body and headers verbatim', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ id: 'svc-1' }), { status: 201 }));
    const body = JSON.stringify({ name: 'Acme', uniqueName: 'acme' });

    const res = await route.POST(
      new Request('http://web.local/api/ext-service/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer caller-token' },
        body,
      }),
    );

    const { url, init } = callOf(fetchMock);
    expect(url).toBe('http://api.test/api/ext-service/create');
    expect(init?.method).toBe('POST');
    expect(Buffer.from(init?.body as ArrayBuffer).toString('utf8')).toBe(body);
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer caller-token');
    expect(res.status).toBe(201);
  });

  it('passes an upstream error status through unchanged', async () => {
    stubFetch(new Response(JSON.stringify({ error: 'External service not found' }), { status: 404 }));

    const res = await route.GET(new Request('http://web.local/api/ext-service/missing'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'External service not found' });
  });

  it('answers 502 when the API host is unreachable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await route.GET(new Request('http://web.local/api/ext-service/all'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Upstream API is unreachable' });
  });
});
