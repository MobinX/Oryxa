import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthToken } from '@/lib/auth';
import { isOperatorEmail, logsBearer, operatorAccountEmail } from '@/lib/logs-session';
import { verifyOperatorToken } from '@/lib/operator-login';

export const OPERATOR_AUTH_COOKIE = 'oryxa_operator_token';

export async function getOperatorAuthToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(OPERATOR_AUTH_COOKIE)?.value ?? null;
}

export async function setOperatorAuthCookie(token: string) {
  const store = await cookies();
  store.set(OPERATOR_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour — matches Firebase ID token lifetime
  });
}

export async function clearOperatorAuthCookie() {
  const store = await cookies();
  store.delete(OPERATOR_AUTH_COOKIE);
}

/**
 * The console used to accept the reader's own account token as proof that they were the operator,
 * because the API let an allowlisted user id through `/api2` as well. That made the merchant
 * sign-in the front door to the admin panel: any account holding a token could open the platform
 * dashboard, the plans table, every store's token bill and the agent playground.
 *
 * Two proofs exist now, and they answer different questions. The console session is a DB
 * session issued by the admin login; the legacy logs cookie remains a fallback for existing
 * sessions. The account token is a separate thing: it is what the merchant endpoints see, it
 * lives an hour, and it can belong to somebody else while a session is still open, which is why
 * the pages that use it have it re-checked against Google.
 */

/** What `/api2` accepts as this reader's authority: the console secret, never the reader's token. */
export async function requireConsoleBearer(): Promise<string> {
  const bearer = await logsBearer();
  if (bearer) return bearer;
  redirect('/admin/login');
}

/** The browser's account token, but only once Google says it is an operator account. */
export async function operatorToken(): Promise<string | null> {
  const opToken = await getOperatorAuthToken();
  if (opToken) {
    const verified = await verifyOperatorToken(opToken);
    if (verified?.email && isOperatorEmail(verified.email)) {
      return opToken;
    }
  }

  const authToken = await getAuthToken();
  if (authToken) {
    const verified = await verifyOperatorToken(authToken);
    if (verified?.email && isOperatorEmail(verified.email)) {
      return authToken;
    }
  }

  return null;
}

/**
 * For the pages that act on a store through the merchant API as the operator — the playground.
 * The ordinary reason this turns someone away is a console session that has outlived the hour-old
 * token inside it, so the reader goes back to the sign-in page, where one credential replaces both
 * cookies at once, rather than to an error they can do nothing about.
 */
export async function requireOperatorToken(): Promise<string> {
  await requireConsoleBearer();

  const token = await operatorToken();
  if (token) return token;

  redirect('/admin/login?error=notoperator');
}
