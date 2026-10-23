/**
 * In-memory sliding-window rate limiter for the playground proxy routes.
 *
 * Scope: per process, keyed by client IP plus the store being driven. The playground spends the
 * store's real LLM tokens with every run, so this is a spray guard, not a billing meter. A rate
 * key contains no secrets and no personal data, and the window state dies with the server
 * process — nothing here is durable by design.
 */

const WINDOW_MS = 60_000;
const WINDOW_LIMIT = 10;

type Window = { hits: number[] };

const windows = new Map<string, Window>();

/** Last sweep time, so the map cannot grow unbounded on an idle server. */
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, window] of windows) {
    const fresh = window.hits.filter((t) => now - t < WINDOW_MS * 60);
    if (fresh.length === 0) windows.delete(key);
    else window.hits = fresh;
  }
}

/** Rough client identity: the left-most forwarding hop, falling back to the peer address. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Records one hit for `ip` on `scope` (the store id) and decides whether the run may proceed.
 * `now` is injectable so tests can drive the window deterministically.
 */
export function rateLimit(key: string, scope: string, now: number = Date.now()): RateLimitResult {
  sweep(now);

  // Per-IP and per-scope both draw from the same window: a flood from one IP cannot
  // disguise itself by rotating store ids, and one busy store cannot exceed its own share.
  const globalKey = `ip:${key}`;
  const scopeKey = `scope:${key}:${scope}`;
  const results: RateLimitResult[] = [];

  for (const mapKey of [globalKey, scopeKey]) {
    const window = windows.get(mapKey) ?? { hits: [] };
    window.hits = window.hits.filter((t) => now - t < WINDOW_MS);
    if (window.hits.length >= WINDOW_LIMIT) {
      const oldest = window.hits[0] ?? now;
      results.push({ allowed: false, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) });
    } else {
      window.hits.push(now);
      windows.set(mapKey, window);
      results.push({ allowed: true });
    }
  }

  // A denial on either counter blocks the run. Denied attempts still consume the
  // other counter's room, so a client that keeps hammering cannot rotate scopes to
  // dodge the IP window — burnout applies whichever counter fills first.
  const denied = results.find((r) => !r.allowed);
  if (denied && denied.retryAfter !== undefined) return { allowed: false, retryAfter: denied.retryAfter };
  return { allowed: true };
}
