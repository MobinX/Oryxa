export class MailWorkerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'MailWorkerError';
  }
}

function baseUrl(): string {
  const url = process.env.MAIL_WORKER_URL?.trim();
  if (!url) throw new MailWorkerError('MAIL_WORKER_URL is not configured', 503);
  return url.replace(/\/+$/, '');
}

function apiKey(): string {
  const key = process.env.MAIL_WORKER_API_KEY?.trim();
  if (!key) throw new MailWorkerError('MAIL_WORKER_API_KEY is not configured', 503);
  return key;
}

export async function mailWorkerResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-api-key', apiKey());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new MailWorkerError(
      `Mail Worker unreachable: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
  return response;
}

export async function mailWorkerJson<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await mailWorkerResponse(path, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const payload = body as { error?: { message?: string } | string } | null;
    const message =
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
      `Mail Worker rejected the request (${response.status})`;
    throw new MailWorkerError(message, response.status >= 500 ? 502 : response.status);
  }
  return body as T;
}

export interface WorkerMailbox {
  id: string;
  address: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerEmailRow {
  id: string;
  mailbox_id: string;
  direction: 'inbound' | 'outbound';
  from: { email: string; name: string };
  to_email: string;
  subject: string;
  message_id: string | null;
  provider: string;
  provider_message_id: string | null;
  json_key: string;
  json_url: string;
  size_bytes: number;
  attachment_count: number;
  status: string;
  is_trashed: boolean;
  trashed_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface WorkerEmailDocument {
  id: string;
  mailboxId: string;
  direction: 'inbound' | 'outbound';
  messageId: string | null;
  from: { email: string; name: string };
  to: Array<{ email: string; name: string }>;
  cc: Array<{ email: string; name: string }>;
  bcc: Array<{ email: string; name: string }>;
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    disposition: string;
    b2Key: string;
  }>;
  provider: { name: string; messageId: string | null };
  sizeBytes: number;
}

export async function ensureMailbox(email: string, name?: string | null): Promise<WorkerMailbox> {
  const body = await mailWorkerJson<{ mailbox: WorkerMailbox }>('/api/mailboxes', {
    method: 'POST',
    body: JSON.stringify({ address: email, ...(name ? { name } : {}) }),
  });
  return body.mailbox;
}

export async function listMailboxEmails(
  mailboxId: string,
  query: Record<string, string | number | undefined>,
): Promise<{
  mailbox: WorkerMailbox;
  emails: WorkerEmailRow[];
  total: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const suffix = params.toString();
  return await mailWorkerJson(`/api/mailboxes/${encodeURIComponent(mailboxId)}/emails${suffix ? `?${suffix}` : ''}`);
}

export async function getWorkerEmail(emailId: string): Promise<{
  email: WorkerEmailRow;
  content: WorkerEmailDocument | null;
  content_available: boolean;
}> {
  return await mailWorkerJson(`/api/emails/${encodeURIComponent(emailId)}`);
}

export async function sendWorkerEmail(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return await mailWorkerJson('/api/emails/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function replyWorkerEmail(
  emailId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await mailWorkerJson(`/api/emails/${encodeURIComponent(emailId)}/reply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function forwardWorkerEmail(
  emailId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await mailWorkerJson(`/api/emails/${encodeURIComponent(emailId)}/forward`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function mailboxStorage(mailboxId: string): Promise<Record<string, unknown>> {
  return await mailWorkerJson(`/api/storage?mailbox_id=${encodeURIComponent(mailboxId)}`);
}
