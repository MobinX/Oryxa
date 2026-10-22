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

/**
 * The Firebase account the console signs in as. The local part is the same `LOGS_UI_USER` the
 * password form already showed, so the operator types one word and this fills in the domain the
 * account was created under (`apps/api/scripts/create-operator.ts`).
 */
export function operatorAccountEmail(): string {
  const configured = process.env.ADMIN_SIGNIN_EMAIL?.trim();
  if (configured) return configured;
  return `${logsOperatorUser()}@${process.env.ADMIN_SIGNIN_DOMAIN?.trim() || 'oryxa.app'}`;
}

/** Check if an email is an authorized operator (default operator or configured admin) */
export function isOperatorEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const defaultOp = operatorAccountEmail().toLowerCase().trim();
  if (normalized === defaultOp) return true;

  const allowed = (process.env.ADMIN_EMAILS || 'mobin.devx@gmail.com')
    .split(',')
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return allowed.includes(normalized);
}

/** Undefined unless `LOGS_UI_PASSWORD` is set — no default password in any environment. */
export function logsOperatorPassword(): string | undefined {
  const configured = process.env.LOGS_UI_PASSWORD?.trim();
  if (configured) return configured;
  // No default in any environment: the console is closed until LOGS_UI_PASSWORD is set.
  return undefined;
}

function sameSecret(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  // The length differs before the comparison, which is not a secret worth guarding.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The HMAC key is the password, so rotating `LOGS_UI_PASSWORD` signs every issued cookie out. The
 * password itself never enters the cookie: what the browser holds is a signature over an expiry
 * *and the account it was issued to*, and the bearer for the API is read from env. The account
 * belongs in the signed payload because a signature over an expiry alone says only "somebody who
 * knew the password" — it keeps saying that after the operator account is rotated, and it says it
 * to every page for eight hours without asking who is reading.
 */
function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/** @param as the operator account Google confirmed at sign-in, bound into the cookie. */
export async function startLogsSession(as: string): Promise<boolean> {
  const key = logsOperatorPassword();
  if (!key) return false;
  const payload = `${Date.now() + SESSION_MS}|${as}`;
  const store = await cookies();
  store.set(LOGS_COOKIE, `${Buffer.from(payload, 'utf8').toString('base64url')}.${sign(payload, key)}`, {
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

/**
 * True only for an unexpired cookie this process can still sign, issued to the account this
 * deployment considers the operator. Every admin page asks, so holding the console is a question
 * re-answered on each read rather than something decided when the door was first opened.
 */
export async function hasLogsSession(): Promise<boolean> {
  const key = logsOperatorPassword();
  if (!key) return false;
  const store = await cookies();
  const raw = store.get(LOGS_COOKIE)?.value;
  if (!raw) return false;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  // Integrity before content: nothing below this line trusts a byte the browser sent.
  if (!sameSecret(signature, sign(decoded, key))) return false;

  const [at, ...who] = decoded.split('|');
  const time = Number(at);
  if (!Number.isFinite(time) || time < Date.now()) return false;

  const email = who.join('|');
  return isOperatorEmail(email);
}

/**
 * What to present to the API for a signed-in console: the password, which is the
 * secret the log route recognises. Server-side only — the browser never sees it,
 * its proof is the signature above.
 */
export async function logsBearer(): Promise<string | null> {
  return (await hasLogsSession()) ? (logsOperatorPassword() ?? null) : null;
}
