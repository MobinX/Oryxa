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

function timeoutMs(): number {
  const parsed = Number(process.env.MAIL_WORKER_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 30_000;
  return Math.min(120_000, Math.max(5_000, Math.floor(parsed)));
}

function maxAttempts(): number {
  const parsed = Number(process.env.MAIL_WORKER_MAX_ATTEMPTS);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.floor(parsed)));
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 502 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logRetry(path: string, attempt: number, attempts: number, detail: string): void {
  console.warn(JSON.stringify({ event: 'mail_worker_retry', path, attempt, attempts, detail }));
}

export async function mailWorkerResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-api-key', apiKey());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const attempts = maxAttempts();
  const timeout = timeoutMs();
  let lastError: unknown = null;
  // Retries are safe here: the Worker only answers 5xx when the provider
  // send failed (nothing was delivered) or the request never completed;
  // 4xx validation failures are returned immediately without retry.
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl()}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      if (!retryableStatus(response.status) || attempt === attempts) return response;
      logRetry(path, attempt, attempts, `status ${response.status}`);
      await response.arrayBuffer().catch(() => null);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      logRetry(
        path,
        attempt,
        attempts,
        error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      );
    }
    await sleep(Math.min(8_000, 250 * 2 ** (attempt - 1)));
  }
  if (lastError) {
    throw new MailWorkerError(
      `Mail Worker unreachable: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      502,
    );
  }
  throw new MailWorkerError('Mail Worker is unavailable', 502);
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
  spam_score?: number;
  is_spam?: boolean;
  spam_reason?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
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

/**
 * Mailbox id memo. Every mail page load fires several API requests (list pane +
 * detail pane), and each one used to POST /api/mailboxes before its real call —
 * doubling Worker roundtrips. Mailboxes are never deleted through the UI, so a
 * short-lived memo is safe; in-flight dedup collapses concurrent ensures (the
 * list+detail pair) into a single POST even on a cold instance.
 */
const MAILBOX_MEMO_TTL_MS = 60_000;
const mailboxMemo = new Map<string, { mailbox: WorkerMailbox; expiresAt: number }>();
const mailboxInflight = new Map<string, Promise<WorkerMailbox>>();

export async function ensureMailbox(email: string, name?: string | null): Promise<WorkerMailbox> {
  const key = email.trim().toLowerCase();
  const cached = mailboxMemo.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.mailbox;
  mailboxMemo.delete(key);
  const inflight = mailboxInflight.get(key);
  if (inflight) return inflight;
  const pending = mailWorkerJson<{ mailbox: WorkerMailbox }>('/api/mailboxes', {
    method: 'POST',
    body: JSON.stringify({ address: email, ...(name ? { name } : {}) }),
  }).then(
    (body) => {
      mailboxMemo.set(key, { mailbox: body.mailbox, expiresAt: Date.now() + MAILBOX_MEMO_TTL_MS });
      mailboxInflight.delete(key);
      return body.mailbox;
    },
    (error) => {
      mailboxInflight.delete(key);
      throw error;
    },
  );
  mailboxInflight.set(key, pending);
  return pending;
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
