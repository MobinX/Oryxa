'use server';

import { redirect } from 'next/navigation';
import { clearOperatorAuthCookie } from '@/lib/admin-access';
import { clearLogsSession } from '@/lib/logs-session';
import { clearConsoleCookie, getConsoleToken } from '@/lib/console-cookie';
import { API_BASE_URL } from '@/lib/api-base';

export async function logsSignOutAction(): Promise<void> {
  const token = await getConsoleToken();
  if (token) {
    await fetch(`${API_BASE_URL}/api2/admin/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  await clearConsoleCookie();
  await clearLogsSession();
  await clearOperatorAuthCookie();
  redirect('/admin/login');
}
