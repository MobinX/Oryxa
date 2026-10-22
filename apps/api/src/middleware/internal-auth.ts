import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';

/**
 * The internal routes drive the agent for any conversation, so the shared secret in front of
 * them is the whole boundary. A short or missing secret is a misconfiguration rather than a
 * weaker password: with it unset Hono would otherwise compare `undefined` against a missing
 * header and let the request through.
 */
const MIN_INTERNAL_KEY_LENGTH = 16;

export function internalKeyConfigured(): boolean {
  const configured = process.env.INTERNAL_KEY;
  return typeof configured === 'string' && configured.length >= MIN_INTERNAL_KEY_LENGTH;
}

/** Constant-time when the lengths agree; `timingSafeEqual` throws on a mismatch. */
export function internalKeyMatches(candidate: string | undefined): boolean {
  const expected = process.env.INTERNAL_KEY;
  if (!internalKeyConfigured() || typeof expected !== 'string' || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const internalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  if (!internalKeyMatches(c.req.header('x-internal-key'))) {
    return c.text('Unauthorized', 401);
  }
  return next();
};
