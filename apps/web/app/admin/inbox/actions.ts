'use server';

import { redirect } from 'next/navigation';
import { consoleApiFetch } from '@/lib/console-session';
import { parseUploadedAttachmentsField } from '@/lib/mail-attachments';

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
  try {
    await consoleApiFetch('/api2/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        to,
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        subject,
        text,
        uploaded_attachments: parseUploadedAttachmentsField(formData),
      }),
    });
  } catch (error) {
    failTarget('/admin/inbox?compose=1', error);
  }
  redirect('/admin/inbox?folder=sent&sent=1');
}

export async function replyMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const text = String(formData.get('text') ?? '');
  if (!id) failTarget('/admin/inbox', new Error('Missing email id.'));
  if (!text.trim()) failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, new Error('Reply body is required.'));
  try {
    await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text,
        uploaded_attachments: parseUploadedAttachmentsField(formData),
      }),
    });
  } catch (error) {
    failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, error);
  }
  redirect('/admin/inbox?folder=sent&sent=1');
}

export async function forwardMailAction(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  const to = formString(formData, 'to');
  if (!id) failTarget('/admin/inbox', new Error('Missing email id.'));
  if (!to) failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, new Error('Forward recipient is required.'));
  try {
    await consoleApiFetch(`/api2/admin/mail/emails/${encodeURIComponent(id)}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        to,
        cc: formString(formData, 'cc'),
        bcc: formString(formData, 'bcc'),
        text: String(formData.get('text') ?? '').trim(),
        uploaded_attachments: parseUploadedAttachmentsField(formData),
      }),
    });
  } catch (error) {
    failTarget(`/admin/inbox?id=${encodeURIComponent(id)}`, error);
  }
  redirect('/admin/inbox?folder=sent&sent=1');
}
