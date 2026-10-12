import { NextRequest } from 'next/server';
import { authorizePlaygroundRun } from '@/lib/playground-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A playground line: the comment the agent must handle, or one of the earlier ones. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/**
 * Runs a comment through the store's own comment agent and streams what it decides — which of the
 * two delivery tools it reached for, and what each carried. Whoever owns the store can run it:
 * `authorizePlaygroundRun` settles that against the merchant API before anything is forwarded.
 */
export async function POST(req: NextRequest) {
  let body: { businessId?: unknown; channelId?: unknown; comment?: unknown; history?: unknown; commenterName?: unknown; postId?: unknown };
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

  const denied = await authorizePlaygroundRun(businessId, channelId);
  if (denied) return jsonError(denied.status, denied.error);

  const comment = text(body.comment, 2000);
  if (!comment) return jsonError(400, 'comment is required');

  const history = Array.isArray(body.history)
    ? body.history
        .map((row) => {
          const content = typeof row === 'object' && row ? text((row as { content?: unknown }).content, 2000) : null;
          const from = (row as { from?: unknown })?.from === 'self' ? 'self' : 'customer';
          return content ? { from, content } : null;
        })
        .filter((row): row is { from: 'customer' | 'self'; content: string } => row !== null)
        .slice(0, 20)
    : [];

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const cleanBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const internalKey = process.env.INTERNAL_KEY || 'change-me-to-random-secret';

  const apiRes = await fetch(`${cleanBaseUrl}/internal/test-comment-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': internalKey,
    },
    body: JSON.stringify({
      businessId,
      channelId,
      comment,
      history,
      commenterName: text(body.commenterName, 120) ?? undefined,
      postId: text(body.postId, 120) ?? undefined,
    }),
  });

  if (!apiRes.ok) {
    const errorText = await apiRes.text();
    return new Response(JSON.stringify({ error: errorText || 'Failed to start the comment test run' }), {
      status: apiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
