'use server';

import { redirect } from 'next/navigation';
import { consoleApiFetch } from '@/lib/console-session';

export async function changeConsolePasswordAction(formData: FormData): Promise<void> {
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (next !== confirm) redirect('/admin/settings?error=match');
  try {
    await consoleApiFetch('/api2/admin/password', {
      method: 'POST',
      body: JSON.stringify({ current, next }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not change password';
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }
  redirect('/admin/settings?saved=1');
}
