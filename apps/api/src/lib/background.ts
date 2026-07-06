import type { Context } from 'hono';

// Promises tracked for Bun/Node runtimes so tests can flush them deterministically.
const pending = new Set<Promise<unknown>>();

type ExecutionCtxLike = { waitUntil: (p: Promise<unknown>) => void };

/**
 * Runs `promise` in the background without blocking the HTTP response.
 *
 * Platform support — checked in priority order:
 *
 * 1. **Vercel** (`process.env.VERCEL`) — uses `waitUntil` from
 *    `@vercel/functions`. Registers the promise with Vercel's lifecycle so it
 *    survives past the response AND logs appear in the **same invocation**.
 *
 * 2. **Cloudflare Workers / Netlify Edge** — both implement the Web Workers
 *    `ExecutionContext` API. Hono exposes it as `c.executionCtx.waitUntil()`,
 *    which tells the runtime to keep the isolate alive until the promise settles.
 *    Cloudflare: 30 s limit after response. Netlify: subject to CPU time limits.
 *
 * 3. **Bun / Node (local dev, self-hosted)** — process never shuts down between
 *    requests, so the promise runs freely on the event loop. Tracked in `pending`
 *    for deterministic test flushing via `flushBackground()`.
 */
export function runInBackground<T>(c: Context, promise: Promise<T>): void {
  const safe = promise.catch((err) => console.error('[background] task error:', err));

  // ── 1. Vercel ──────────────────────────────────────────────────────────────
  if (process.env.VERCEL) {
    import('@vercel/functions')
      .then(({ waitUntil }) => waitUntil(safe))
      .catch(() => {
        // @vercel/functions unavailable — fall through to event-loop path so
        // work is never silently dropped.
        const tracked = safe.finally(() => pending.delete(tracked));
        pending.add(tracked);
      });
    return;
  }

  // ── 2. Cloudflare Workers & Netlify Edge (ExecutionContext API) ────────────
  try {
    const ctx = (c as unknown as { executionCtx?: ExecutionCtxLike }).executionCtx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(safe);
      return;
    }
  } catch {
    // executionCtx not available on this runtime — fall through.
  }

  // ── 3. Bun / Node / tests ─────────────────────────────────────────────────
  const tracked = safe.finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Await all in-flight background tasks (test helper; no-op on edge runtimes). */
export async function flushBackground(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
