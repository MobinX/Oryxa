import { NextRequest } from 'next/server';
import { authorizePlaygroundRun } from '@/lib/playground-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  let body: { businessId?: unknown; channelId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Malformed JSON');
  }

  const { businessId, channelId } = body;
  if (typeof businessId !== 'string' || !UUID.test(businessId)) {
    return jsonError(400, 'businessId is required and must be a store id');
  }
  if (typeof channelId !== 'string' || !UUID.test(channelId)) {
    return jsonError(400, 'channelId is required and must be a channel id');
  }

  // `/internal/test-run` is keyed by a shared secret, not by who is asking, so it cannot tell one
  // merchant from another and would happily drive any store's agent. This proxy is the only caller
  // in the app, so ownership is settled here, against the merchant API and the caller's own token.
  const denied = await authorizePlaygroundRun(businessId, channelId);
  if (denied) return jsonError(denied.status, denied.error);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const cleanBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const internalKey = process.env.INTERNAL_KEY || 'change-me-to-random-secret';

  // Fetch the agent test-run stream from the Hono API
  const apiRes = await fetch(`${cleanBaseUrl}/internal/test-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': internalKey,
    },
    body: JSON.stringify(body),
  });

  if (!apiRes.ok) {
    const errorText = await apiRes.text();
    return new Response(JSON.stringify({ error: errorText || 'Failed to trigger agent test run' }), {
      status: apiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream Hono's Server-Sent Events (SSE) back to the browser client
  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiRes.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
