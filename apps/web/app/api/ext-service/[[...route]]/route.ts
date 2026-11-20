import { NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

/**
 * Headers that describe this hop, not the request: forwarding them would either lie about the
 * upstream body (`content-length`) or ask the upstream to compress a response this proxy would
 * then hand on untouched (`accept-encoding`).
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'accept-encoding',
]);

/** The external-service API lives at the same path on the API host. */
function upstreamUrl(req: Request): string {
  const url = new URL(req.url);
  return `${API_URL}${url.pathname}${url.search}`;
}

function copyHeaders(from: Headers): Headers {
  const to = new Headers();
  from.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) to.set(key, value);
  });
  return to;
}

/**
 * `GET/POST/PUT/DELETE /api/ext-service/*` — the web origin's door to the integration API.
 *
 * The route exists so callers can use `https://<web>/api/ext-service/...` exactly like the
 * other `/api/*` paths, without knowing the API host. It forwards the method, query string,
 * body and headers verbatim and returns the upstream status and body unchanged; redirects are
 * passed through rather than followed so an OAuth hop still lands in the caller's browser.
 */
async function proxy(req: Request): Promise<Response> {
  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl(req), {
      method,
      headers: copyHeaders(req.headers),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch (err) {
    console.error('[ext-service proxy] upstream request failed', err);
    return NextResponse.json({ error: 'Upstream API is unreachable' }, { status: 502 });
  }

  // 204/205/304 (and HEAD) carry no body; constructing a Response with one throws.
  const nullBody = method === 'HEAD' || [204, 205, 304].includes(upstream.status);
  const body = nullBody ? null : await upstream.arrayBuffer();

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyHeaders(upstream.headers),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
