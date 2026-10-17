'use server';

import { redirect } from 'next/navigation';
import { clearOperatorAuthCookie, setOperatorAuthCookie } from '@/lib/admin-access';
import { syncUser } from '@/lib/api';
import { clearLogsSession, isOperatorEmail, operatorAccountEmail, startLogsSession } from '@/lib/logs-session';
import { verifyOperatorToken } from '@/lib/operator-login';
import { COMPANY_NAME } from '@/lib/brand';

/**
 * Finishes the sign-in the browser started against Firebase.
 *
 * The credential is an authorized operator Firebase account (`admin123@oryxa.app` or an allowlisted admin),
 * so the console sets both the console logs session and the operator authentication cookie.
 */
export async function operatorSignInAction(idToken: string) {
  const verified = await verifyOperatorToken(idToken);

  // Check against Google's record that this is an authorized operator
  if (!verified || !isOperatorEmail(verified.email)) {
    redirect('/admin/login?error=invalid');
  }

  await syncUser({
    firebaseUid: verified.uid,
    name: `${COMPANY_NAME} Operator`,
    email: verified.email ?? undefined,
    signInMethod: 'password',
  });

  if (!(await startLogsSession(verified.email ?? operatorAccountEmail()))) {
    redirect('/admin/login?error=disabled');
  }

  // Set dedicated operator token cookie so it never collides with merchant login cookies
  await setOperatorAuthCookie(idToken);
  redirect('/admin/agent-playground');
}

export async function logsSignOutAction() {
  await clearLogsSession();
  await clearOperatorAuthCookie();
  redirect('/admin/login');
}
