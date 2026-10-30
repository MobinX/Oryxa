/**
 * Sliding-window limiter keyed by an arbitrary string (e.g. `${ip}|${slug}`). In-memory and per
 * instance: on serverless it bounds a burst against one warm instance, not a distributed attack —
 * put a shared store or WAF rule in front for that.
 */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  const hits = new Map<string, number[]>();
  return function limited(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > maxKeys) hits.clear();
    return recent.length > limit;
  };
}
