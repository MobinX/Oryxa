import type { Context } from 'hono';

// Promises tracked for non-edge runtimes so tests can flush them deterministically.
const pending = new Set<Promise<unknown>>();

type ExecutionContextLike = { waitUntil?: (p: Promise<unknown>) => void };

/**
 * Runs `promise` after the response is sent.
 *
 * On edge/serverless runtimes (Vercel, Workers) uses `c.executionCtx.waitUntil`
 * so the platform keeps the work alive past the request. On a long-lived Node/
 * Bun server it's fire-and-forget (the process stays up). In tests (no
 * executionCtx) the promise is tracked in `pending` so `flushBackground` can
 * await it — keeping webhook tests deterministic.
 */
export function runInBackground<T>(c: Context, promise: Promise<T>): void {
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try {
    const ctx = (c as unknown as { executionCtx?: ExecutionContextLike }).executionCtx;
    waitUntil = ctx?.waitUntil?.bind(ctx);
  } catch {
    // No ExecutionContext available (Node/Bun/tests).
  }

  if (waitUntil) {
    waitUntil(promise.catch((err) => console.error('Background task error:', err)));
    return;
  }

  const tracked = promise.finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Await all in-flight background tasks (test helper; no-op on edge). */
export async function flushBackground(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
