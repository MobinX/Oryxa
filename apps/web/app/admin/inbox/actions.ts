'use server';

import { redirect } from 'next/navigation';
import { consoleApiFetch } from '@/lib/console-session';

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
    failTarget('/admin/inbox?compose=1', new Error('To, subject and message are required.'));
  }
  let result: { email: { id: string } };
  try {
    result = await consoleApiFetch('/api2/admin/mail/send', {
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
    failTarget('/admin/inbox?compose=1', error);
  }
  redirect(`/admin/inbox?folder=sent&id=${encodeURIComponent(result.email.id)}&sent=1`);
}

export async function replyMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const text = String(formData.get('text') ?? '');
  if (!id) failTarget('/admin/inbox', new Error('Missing email id.'));
  if (!text.trim()) failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, new Error('Reply body is required.'));
  let result: { email: { id: string } };
  try {
    result = await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text,
      }),
    });
  } catch (error) {
    failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, error);
  }
  redirect(`/admin/inbox?folder=sent&id=${encodeURIComponent(result.email.id)}&sent=1`);
}

export async function forwardMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const to = formString(formData, 'to');
  if (!id) failTarget('/admin/inbox', new Error('Missing email id.'));
  if (!to) failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, new Error('Forward recipient is required.'));
  let result: { email: { id: string } };
  try {
    result = await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        to,
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text: String(formData.get('text') ?? '').trim(),
      }),
    });
  } catch (error) {
    failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, error);
  }
  redirect(`/admin/inbox?folder=sent&id=${encodeURIComponent(result.email.id)}&sent=1`);
}
