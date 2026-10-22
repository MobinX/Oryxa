'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { clearOperatorAuthCookie, setOperatorAuthCookie } from '@/lib/admin-access';
import { syncUser } from '@/lib/api';
import { clearLogsSession, isOperatorEmail, operatorAccountEmail, startLogsSession } from '@/lib/logs-session';
import { verifyOperatorToken } from '@/lib/operator-login';
import { COMPANY_NAME } from '@/lib/brand';

/**
 * Finishes the sign-in the browser started against Firebase.
 *
 * The credential is an authorized operator Firebase account (the configured
 * operator account or an allowlisted admin from ADMIN_EMAILS).
 * so the console sets both the console logs session and the operator authentication cookie.
 */
/**
 * Brute-force brake for the console sign-in. In-memory per server instance: it
 * throttles credential guessing per source IP, resets after ten quiet minutes,
 * and holds nothing — the durable checks remain Google's (the token must verify)
 * and the allowlist below.
 */
const SIGNIN_ATTEMPTS = new Map<string, { count: number; first: number }>();
const SIGNIN_WINDOW_MS = 15 * 60 * 1000;
const SIGNIN_MAX = 10;

function signinRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = SIGNIN_ATTEMPTS.get(ip);
  if (!record || now - record.first > SIGNIN_WINDOW_MS) {
    SIGNIN_ATTEMPTS.set(ip, { count: 1, first: now });
    return false;
  }
  record.count += 1;
  return record.count > SIGNIN_MAX;
}

export async function operatorSignInAction(idToken: string) {
  const headerList = await headers();
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip') ||
    'unknown';
  if (signinRateLimited(ip)) redirect('/admin/login?error=rate_limited');

  const verified = await verifyOperatorToken(idToken);

  // Check against Google's record that this is an authorized operator
  if (!verified || !isOperatorEmail(verified.email)) {
    redirect('/admin/login?error=invalid');
  }

  await syncUser(idToken, {
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
