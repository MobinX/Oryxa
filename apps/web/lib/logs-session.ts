import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const LOGS_COOKIE = 'oryxa_logs_session';

const SESSION_MS = 8 * 60 * 60 * 1000;

/**
 * The same two variables the API reads, so the console and the route agree without
 * a shared module: apps/web does not depend on `@repo/shared`, and adding a
 * workspace dependency plus a transpile entry to a live production build is a
 * larger risk than repeating four lines of env parsing.
 */
export function logsOperatorUser(): string {
  return process.env.LOGS_UI_USER?.trim() || 'admin123';
}

/** Undefined in production unless `LOGS_UI_PASSWORD` is set — no guessable default. */
export function logsOperatorPassword(): string | undefined {
  const configured = process.env.LOGS_UI_PASSWORD?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? undefined : 'admin123';
}

function sameSecret(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  // The length differs before the comparison, which is not a secret worth guarding.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The HMAC key is the password, so rotating `LOGS_UI_PASSWORD` signs every issued
 * cookie out. The password itself never enters the cookie: what the browser holds
 * is a signature over an expiry, and the bearer for the API is read from env.
 */
function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function operatorCredentialsMatch(user: string, password: string): boolean {
  const expected = logsOperatorPassword();
  if (!expected) return false;
  return sameSecret(user, logsOperatorUser()) && sameSecret(password, expected);
}

export async function startLogsSession(): Promise<boolean> {
  const key = logsOperatorPassword();
  if (!key) return false;
  const expiry = String(Date.now() + SESSION_MS);
  const store = await cookies();
  store.set(LOGS_COOKIE, `${Buffer.from(expiry, 'utf8').toString('base64url')}.${sign(expiry, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  });
  return true;
}

export async function clearLogsSession(): Promise<void> {
  const store = await cookies();
  store.delete(LOGS_COOKIE);
}

/** True only for an unexpired cookie this process can still sign. */
export async function hasLogsSession(): Promise<boolean> {
  const key = logsOperatorPassword();
  if (!key) return false;
  const store = await cookies();
  const raw = store.get(LOGS_COOKIE)?.value;
  if (!raw) return false;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return false;

  let expiry: string;
  try {
    expiry = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const at = Number(expiry);
  if (!Number.isFinite(at) || at < Date.now()) return false;

  return sameSecret(signature, sign(expiry, key));
}

/**
 * What to present to the API for a signed-in console: the password, which is the
 * secret the log route recognises. Server-side only — the browser never sees it,
 * its proof is the signature above.
 */
export async function logsBearer(): Promise<string | null> {
  return (await hasLogsSession()) ? (logsOperatorPassword() ?? null) : null;
}
