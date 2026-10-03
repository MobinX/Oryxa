'use server';

import { redirect } from 'next/navigation';
import {
  clearLogsSession,
  logsOperatorPassword,
  operatorCredentialsMatch,
  startLogsSession,
} from '@/lib/logs-session';

export async function logsSignInAction(formData: FormData) {
  const user = String(formData.get('user') ?? '');
  const password = String(formData.get('password') ?? '');

  // Configured only by env, so the answer is a state of the deployment, not a
  // secret about this account.
  if (!logsOperatorPassword()) redirect('/logs/login?error=disabled');

  if (!operatorCredentialsMatch(user, password)) redirect('/logs/login?error=invalid');

  await startLogsSession();
  redirect('/logs');
}

export async function logsSignOutAction() {
  await clearLogsSession();
  redirect('/logs/login');
}
