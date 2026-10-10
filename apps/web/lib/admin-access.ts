import { redirect } from 'next/navigation';
import { getAuthToken } from '@/lib/auth';
import { logsBearer, operatorAccountEmail } from '@/lib/logs-session';
import { verifyOperatorToken } from '@/lib/operator-login';

/**
 * The console used to accept the reader's own account token as proof that they were the operator,
 * because the API let an allowlisted user id through `/api2` as well. That made the merchant
 * sign-in the front door to the admin panel: any account holding a token could open the platform
 * dashboard, the plans table, every store's token bill and the agent playground.
 *
 * Two proofs exist now, and they answer different questions. The console session is a signature
 * this app makes over an expiry, and only `operatorSignInAction` asks for one — after Google
 * confirmed that the account behind the credential is the operator's. So the session is the door,
 * and nothing else opens it. The account token is a separate thing: it is what the merchant
 * endpoints see, it lives an hour, and it can belong to somebody else while a session is still
 * open, which is why the pages that use it have it re-checked against Google.
 */

/** What `/api2` accepts as this reader's authority: the console secret, never the reader's token. */
export async function requireConsoleBearer(): Promise<string> {
  const bearer = await logsBearer();
  if (bearer) return bearer;
  redirect('/admin/login');
}

/** The browser's account token, but only once Google says it is the operator's own. */
export async function operatorToken(): Promise<string | null> {
  const token = await getAuthToken();
  if (!token) return null;

  const verified = await verifyOperatorToken(token);
  if (!verified?.email) return null;

  return verified.email.toLowerCase() === operatorAccountEmail().toLowerCase() ? token : null;
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
