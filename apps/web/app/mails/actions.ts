'use server';

import { redirect } from 'next/navigation';
import { clearOperatorAuthCookie } from '@/lib/admin-access';
import { clearLogsSession } from '@/lib/logs-session';
import { clearConsoleCookie, getConsoleToken } from '@/lib/console-cookie';
import { API_BASE_URL } from '@/lib/api-base';
import { consoleApiFetch } from '@/lib/console-session';

export async function mailSignOutAction(): Promise<void> {
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
  redirect('/mails/login');
}

function failTarget(base: string, error: unknown): never {
  const message = error instanceof Error ? error.message : 'Mail request failed';
  redirect(`${base}${base.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

function formString(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

export async function sendMailAction(formData: FormData): Promise<void> {
  const to = formString(formData, 'to');
  const subject = formString(formData, 'subject');
  const text = String(formData.get('text') ?? '');
  if (!to || !subject || !text.trim()) {
    failTarget('/mails/compose', new Error('To, subject and message are required.'));
  }
  try {
    await consoleApiFetch('/api2/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        to,
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        subject,
        text,
      }),
    });
  } catch (error) {
    failTarget('/mails/compose', error);
  }
  redirect('/mails?folder=sent&sent=1');
}

export async function replyMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const text = String(formData.get('text') ?? '');
  if (!id) failTarget('/mails', new Error('Missing email id.'));
  if (!text.trim()) {
    failTarget(`/mails/${encodeURIComponent(id)}`, new Error('Reply body is required.'));
  }
  try {
    await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text,
      }),
    });
  } catch (error) {
    failTarget(`/mails/${encodeURIComponent(id)}`, error);
  }
  redirect('/mails?folder=sent&sent=1');
}

export async function forwardMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const to = formString(formData, 'to');
  if (!id) failTarget('/mails', new Error('Missing email id.'));
  if (!to) {
    failTarget(`/mails/${encodeURIComponent(id)}`, new Error('Forward recipient is required.'));
  }
  try {
    await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        to,
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text: String(formData.get('text') ?? '').trim(),
      }),
    });
  } catch (error) {
    failTarget(`/mails/${encodeURIComponent(id)}`, error);
  }
  redirect('/mails?folder=sent&sent=1');
}
