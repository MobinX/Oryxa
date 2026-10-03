import type { Context } from 'hono';
import { waitUntil } from '@vercel/functions';
import { emit, errorFields, flush } from './log';

// Promises tracked for Bun/Node runtimes so tests can flush them deterministically.
const pending = new Set<Promise<unknown>>();

type ExecutionCtxLike = { waitUntil: (p: Promise<unknown>) => void };

function tenth(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/**
 * The task's own failure handling: a background failure never reaches a
 * response, so without this event the only record is stderr — and stderr is not
 * searchable a week later. It ends with the invocation's last `flush()`.
 *
 * The returned promise never rejects, so awaiting it cannot fail a request.
 */
function guarded<T>(promise: Promise<T>, task: string): Promise<void> {
  const started = performance.now();
  return promise
    .catch((err) => {
      emit('bg', {
        task,
        ok: false,
        durationMs: tenth(performance.now() - started),
        ...errorFields(err),
      });
      console.error('[background] task error:', err);
    })
    .then(() => flush());
}

function track(safe: Promise<void>): void {
  const held = safe.finally(() => pending.delete(held));
  pending.add(held);
}

/**
 * Runs `promise` in the background without blocking the HTTP response.
 *
 * Platform support — checked in priority order:
 *
 * 1. **Vercel** (`process.env.VERCEL`) — uses `waitUntil` from
 *    `@vercel/functions`, called synchronously here. Vercel freezes the
 *    invocation once the response is flushed, and a task registered after that
 *    point is never extended, so this cannot go through a dynamic `import()`.
 *    Outside a Vercel invocation `waitUntil` is a silent no-op (a local dev
 *    server inherits `VERCEL=1` from a pulled `.env`), which is why the task is
 *    tracked on the event loop as well.
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
export function runInBackground<T>(c: Context, promise: Promise<T>, task = 'task'): void {
  const safe = guarded(promise, task);

  // ── 1. Vercel ──────────────────────────────────────────────────────────────
  if (process.env.VERCEL) {
    try {
      waitUntil(safe);
    } catch {
      // No request context to attach to — the tracked copy below carries it.
    }
    track(safe);
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
  track(safe);
}

/**
 * Same work as `runInBackground`, but on Vercel the caller waits for it inside
 * the request instead of letting the platform decide how long the rest of it
 * gets to live.
 *
 * The response is unchanged — same status, same body — it simply arrives after
 * the task settles. For an agent run that is the whole point: the run needs
 * 7–12 s of LLM and Graph calls, and a post-response continuation that is
 * frozen part-way through leaves the conversation locked in `working` with
 * nobody left to answer it.
 */
export async function awaitOnVercel<T>(c: Context, promise: Promise<T>, task = 'task'): Promise<void> {
  if (!process.env.VERCEL) {
    runInBackground(c, promise, task);
    return;
  }
  await guarded(promise, task);
}

/** Await all in-flight background tasks (test helper; no-op on edge runtimes). */
export async function flushBackground(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
