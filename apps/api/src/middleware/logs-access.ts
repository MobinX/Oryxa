import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { authMiddleware } from './auth';
import { emit } from '../lib/log';

/**
 * Log events carry other tenants' customer text, run ids and stacks, so a valid
 * session is not enough to read them. `LOG_QUERY_USER_IDS` is a comma-separated
 * list of user ids; with it unset in production the route stays shut, and with it
 * unset locally the dev token is enough — the same shape the auth bypass uses.
 */
export function logsAllowlist(): string[] {
  return (process.env.LOG_QUERY_USER_IDS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

const MIN_OPERATOR_PASSWORD_LENGTH = 12;
const FORBIDDEN_OPERATOR_PASSWORDS = new Set(['change-me']);

/**
 * The second way in: a single operator account, so the log console does not need a
 * Firebase user provisioned into the allowlist. `LOGS_UI_PASSWORD` is the shared
 * secret between the web app and this one — the web app holds it server-side and
 * presents it as the bearer, so it never reaches the browser.
 *
 * A password shorter than 12 characters, or the repository's historical example
 * value, is treated as unset. There is no default in any environment, so the
 * operator path fails closed until a real secret is configured.
 */
export function logsOperatorPassword(): string | undefined {
  const configured = process.env.LOGS_UI_PASSWORD?.trim();
  if (!configured) return undefined;
  if (configured.length < MIN_OPERATOR_PASSWORD_LENGTH) return undefined;
  if (FORBIDDEN_OPERATOR_PASSWORDS.has(configured.toLowerCase())) return undefined;
  return configured;
}

export function logsOperatorUser(): string {
  // A label for the log line, never a credential: the password must always come from env.
  return process.env.LOGS_UI_USER?.trim() || 'operator';
}

/** Equal length first, because `timingSafeEqual` throws on a length mismatch. */
function sameSecret(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Whether a request's `Authorization` header is the operator secret. One definition, because the
 * Hono routes below and the plain route handlers beside them (api2's `/api/brand`) must not be two
 * doors that disagree about who holds the console.
 */
export function isOperatorBearer(header: string | null | undefined): boolean {
  const operator = logsOperatorPassword();
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  return Boolean(operator && bearer && sameSecret(bearer, operator));
}

export const logsAccessMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  const allowed = logsAllowlist();

  if (allowed.length === 0 && process.env.NODE_ENV !== 'production') return next();

  if (user && allowed.includes(user.id)) return next();

  emit('auth', { reason: user ? 'logs_not_allowlisted' : 'logs_anonymous', uid: user?.firebaseUid });
  return c.json({ error: 'Forbidden' }, 403);
};

/**
 * Auth for the log routes only: the operator secret opens them, and any other
 * bearer goes through the ordinary Firebase path and then the allowlist.
 * `authMiddleware` answers a rejection with a Response and an acceptance by
 * calling `next()`, so running it with a recording `next()` tells the two apart
 * without copying its logic.
 */
export const logsAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');
  if (isOperatorBearer(header)) {
    emit('auth', { reason: 'logs_operator', uid: logsOperatorUser() });
    return next();
  }

  let authenticated = false;
  const rejected = await authMiddleware(c, async () => {
    authenticated = true;
  });
  if (!authenticated) return rejected;

  return logsAccessMiddleware(c, next);
};
