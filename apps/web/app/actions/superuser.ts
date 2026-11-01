'use server';

import { redirect } from 'next/navigation';
import { clearConsoleCookie } from '@/lib/console-cookie';
import { clearOperatorAuthCookie } from '@/lib/admin-access';
import { clearLogsSession } from '@/lib/logs-session';

export async function superuserSignOutAction(): Promise<void> {
  await clearConsoleCookie();
  await clearOperatorAuthCookie();
  await clearLogsSession();
  redirect('/superuser/login');
}
