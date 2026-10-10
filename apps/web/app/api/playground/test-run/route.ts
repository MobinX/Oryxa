import { NextRequest } from 'next/server';
import { logsBearer } from '@/lib/logs-session';
import { operatorToken } from '@/lib/admin-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  // Two proofs, because this route spends real tokens: a console session for the admin panel,
  // and an account token that Google says is the operator's. An account token alone used to be
  // enough here, which made an admin-only endpoint available to every merchant who knew the URL.
  if (!(await logsBearer())) return jsonError(401, 'Sign in to the admin console first');
  const token = await operatorToken();
  if (!token) return jsonError(403, 'This sign-in is not the operator account');

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

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const cleanBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const internalKey = process.env.INTERNAL_KEY || 'change-me-to-random-secret';

  // `/internal/test-run` is keyed by a shared secret, not by who is asking, so it cannot tell
  // one merchant from another and would happily drive any store's agent. This proxy is the only
  // caller in the app, so ownership is settled here: the store's agent endpoint sits behind
  // `businessAccessMiddleware`, and anything other than a 200 means the caller does not own it.
  const ownership = await fetch(`${cleanBaseUrl}/api/v1/${businessId}/agents/default`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!ownership.ok) {
    return jsonError(403, 'This store is not yours');
  }

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
