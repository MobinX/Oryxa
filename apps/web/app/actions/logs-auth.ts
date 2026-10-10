'use server';

import { redirect } from 'next/navigation';
import { clearAuthCookie, setAuthCookie } from '@/lib/auth';
import { syncUser } from '@/lib/api';
import { clearLogsSession, operatorAccountEmail, startLogsSession } from '@/lib/logs-session';
import { verifyOperatorToken } from '@/lib/operator-login';

/**
 * Finishes the sign-in the browser started against Firebase.
 *
 * The credential is the operator's Firebase account (`admin123@oryxa.app` by default, created by
 * `apps/api/scripts/create-operator.ts`), so the console no longer asks for `LOGS_UI_PASSWORD`.
 * That password has not gone anywhere — it is still the bearer the log routes recognise, and it
 * is still what signs the session cookie — it is just read from env now instead of typed.
 *
 * Two cookies come out of this, and they are two different permissions. The logs session is what
 * `/admin/token-analytics` and `/admin/logs` read; the account cookie is what lets the agent
 * playground create a sandbox channel and edit the sandbox prompt, because those are merchant
 * routes that check who owns the store. A sign-in that only passed the first would open the
 * console and leave the playground pointing at a login page.
 */
export async function operatorSignInAction(idToken: string) {
  const verified = await verifyOperatorToken(idToken);

  // Any valid token would otherwise be enough, and the project lets anyone sign up — so the
  // account behind the token has to be the operator's, checked against Google's own record.
  if (!verified || verified.email?.toLowerCase() !== operatorAccountEmail().toLowerCase()) {
    redirect('/admin/login?error=invalid');
  }

  await syncUser({
    firebaseUid: verified.uid,
    name: 'Oryxa Operator',
    email: verified.email ?? undefined,
    signInMethod: 'password',
  });

  // No password in env means no session this deployment can sign, which is a state of the host
  // rather than a wrong answer from the person typing. The cookie carries the account Google named,
  // so it says who is reading the console and not merely that somebody knew the secret.
  if (!(await startLogsSession(verified.email ?? operatorAccountEmail()))) {
    redirect('/admin/login?error=disabled');
  }

  await setAuthCookie(idToken);
  redirect('/admin');
}

export async function logsSignOutAction() {
  await clearLogsSession();
  // The console login now also carries the account cookie, and leaving it behind would keep
  // /businesses and the playground open after the reader has signed out.
  await clearAuthCookie();
  redirect('/admin/login');
}
