import type { Context, MiddlewareHandler } from 'hono';
import { startContext, withContext, tagContext, RUN_ID_HEADER, RUN_DEPTH_HEADER } from './ctx';
import { emit, flush, logsToAxiom } from './log';
import { runInBackground } from './background';

const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DEPTH = 64;

function headerInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_DEPTH ? parsed : undefined;
}

/**
 * One `evt=req` per request, with the correlation ids every other event in this
 * invocation is stamped with. Reads only — it sets no request or response
 * header, so the wire contract is untouched.
 */
export const logRequest: MiddlewareHandler = async (c, next) => {
  const inboundRunId = c.req.header(RUN_ID_HEADER);
  const runDepth = headerInt(c.req.header(RUN_DEPTH_HEADER));

  const ctx = startContext({
    ...(inboundRunId && RUN_ID_RE.test(inboundRunId) ? { runId: inboundRunId } : {}),
    ...(runDepth === undefined ? {} : { runDepth }),
  });

  await withContext(ctx, async () => {
    const started = performance.now();
    // Hono's compose turns a thrown handler error into the onError response, so
    // next() normally resolves; if it does reject we must rethrow it unchanged,
    // otherwise a logging bug would become the app's behaviour.
    let pendingError: unknown;
    let threw = false;
    try {
      await next();
    } catch (err) {
      threw = true;
      pendingError = err;
    }

    try {
      const user = c.get('user');
      tagContext({
        ...(user ? { userId: user.id } : {}),
        businessId: c.req.param('businessId'),
        channelId: c.req.param('channelId'),
      });

      if (c.error) {
        emit('error', { name: c.error.name, message: c.error.message, stack: c.error.stack });
      }

      // A preflight carries no application outcome worth a row, and a 404 with no
      // matched route is already reported by the notFound handler — one event each.
      // Neither case returns early: the flush below and the rethrow after it must run
      // whatever happened up here.
      const alreadyReported = c.req.method === 'OPTIONS' || ctx.notFoundHandled;
      if (!alreadyReported) {
        emit('req', {
          method: c.req.method,
          path: c.req.path,
          routePath: safeRoutePath(c),
          status: c.res.status,
          durationMs: Math.round((performance.now() - started) * 10) / 10,
          contentLength: c.res.headers.get('content-length') ?? undefined,
          userAgent: c.req.header('user-agent') ?? undefined,
        });
      }
    } catch {
      // never let instrumentation alter the response
    }

    // One ingest request per invocation, sent after the response is produced.
    // sendOnce() short-circuits on an empty queue, so a request that logged
    // nothing makes no HTTP call at all.
    runInBackground(c, flush(), 'flush');

    if (threw) throw pendingError;
  });
};

/**
 * Hono's routePath getter reads `matchResult[0][routeIndex].path`, which throws
 * on an unmatched request — exactly the 404 case this runs on. A bare '*' means
 * the only match was this global middleware, i.e. no route handled the request.
 */
function safeRoutePath(c: Context): string | undefined {
  try {
    const matched = c.req.routePath;
    return matched && matched !== '*' ? matched : undefined;
  } catch {
    return undefined;
  }
}

/** Mirrors Hono's default error handler byte-for-byte; only adds the log line. */
export function handleError(err: Error, c: Context): Response {
  emit('error', { name: err.name, message: err.message, stack: err.stack });
  if ('getResponse' in err && typeof err.getResponse === 'function') {
    const res = (err as { getResponse(): Response }).getResponse();
    return c.newResponse(res.body, res);
  }
  // stderr is the only record once Axiom is off; with ingest active the event
  // above already carries it, so printing it again would be a duplicate.
  if (!logsToAxiom()) console.error(err);
  return c.text('Internal Server Error', 500);
}

/** Mirrors Hono's default 404 exactly, and owns the one event for that request. */
export function handleNotFound(c: Context): Response {
  tagContext({ notFoundHandled: true });
  emit('not_found', { method: c.req.method, path: c.req.path });
  return c.text('404 Not Found', 404);
}
