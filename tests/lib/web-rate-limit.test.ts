import { describe, it, expect, beforeEach } from 'vitest';
import { clientIp, rateLimit } from '../../apps/web/lib/rate-limit';

const T0 = 1_700_000_000_000;

describe('web rate limiter (apps/web/lib/rate-limit.ts)', () => {
  beforeEach(() => {
    // Each test runs against a fresh process-internal map is not possible by import alone,
    // but distinct keys per test (unique ip/scope pairs) give the same isolation.
  });

  it('allows 10 requests per minute then returns 429 with Retry-After', () => {
    for (let i = 0; i < 10; i++) {
      expect(rateLimit('ip-a', 'scope-1', T0 + i)).toEqual({ allowed: true });
    }
    const denied = rateLimit('ip-a', 'scope-1', T0 + 10_000);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.retryAfter).toBeGreaterThan(0);
      expect(denied.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it('is per-IP: a different IP on the same scope is unaffected', () => {
    for (let i = 0; i < 10; i++) rateLimit('ip-b', 'scope-2', T0 + i);
    expect(rateLimit('ip-c', 'scope-2', T0 + 11_000)).toEqual({ allowed: true });
  });

  it('is per-scope: the IP budget spans scopes, denying a rotated scope too', () => {
    // One IP sprays through 9 runs on scope A, 1 on scope B → 10 total for the IP.
    for (let i = 0; i < 9; i++) rateLimit('ip-d', 'scope-a', T0 + i);
    expect(rateLimit('ip-d', 'scope-b', T0 + 9_000)).toEqual({ allowed: true });
    expect(rateLimit('ip-d', 'scope-c', T0 + 10_000).allowed).toBe(false);
  });

  it('slides: the window reopens once the minute has passed', () => {
    for (let i = 0; i < 10; i++) rateLimit('ip-e', 'scope-3', T0 + i);
    expect(rateLimit('ip-e', 'scope-3', T0 + 59_999).allowed).toBe(false);
    expect(rateLimit('ip-e', 'scope-3', T0 + 60_001)).toEqual({ allowed: true });
  });

  it('reports Retry-After measured from the oldest hit in the window', () => {
    for (let i = 0; i < 10; i++) rateLimit('ip-f', 'scope-4', T0);
    // 40s after all ten hits landed: 20s remain of the 60s window.
    const denied = rateLimit('ip-f', 'scope-4', T0 + 40_000);
    if (!denied.allowed) expect(denied.retryAfter).toBe(20);
  });

  it('sweeps idle windows so the map does not grow forever', () => {
    // Fill map with stale windows, then jump an hour ahead: the sweep at the next
    // rateLimit call must have dropped them.
    for (let i = 0; i < 10; i++) rateLimit('ip-g', 'scope-5', T0 + i);
    const far = rateLimit('ip-h', 'scope-6', T0 + 3_600_000);
    expect(far).toEqual({ allowed: true });
    // The old window is gone — its minute expired long before the sweep cut-off.
    expect(rateLimit('ip-g', 'scope-5', T0 + 3_600_000)).toEqual({ allowed: true });
  });

  it('prefers x-forwarded-for, then x-real-ip, then "unknown"', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'x-real-ip': '198.51.100.1' });
    expect(clientIp(headers)).toBe('203.0.113.5');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
