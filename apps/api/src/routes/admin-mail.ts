import { Hono, type Context } from 'hono';
import { getSignedUploadUrl } from '@repo/integrations/b2';
import { consoleMailMiddleware, consoleUserFromContext } from '@api/middleware/console-session';
import {
  MailWorkerError,
  ensureMailbox,
  forwardWorkerEmail,
  getWorkerEmail,
  listMailboxEmails,
  mailWorkerResponse,
  mailboxStorage,
  replyWorkerEmail,
  sendWorkerEmail,
  type WorkerMailbox,
} from '@api/lib/mail-worker';

export const adminMailRouter = new Hono();

const MAX_UPLOAD_FILES = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

adminMailRouter.use('/admin/mail', consoleMailMiddleware);
adminMailRouter.use('/admin/mail/*', consoleMailMiddleware);

/**
 * Browser-uploaded attachments arrive as storage keys. The key is minted here, under
 * the signed-in user's mailbox, so the Worker can reject a key that belongs to anyone
 * else when it fetches the bytes at send time.
 */
function readUploadedAttachments(value: unknown): Record<string, unknown>[] | { error: string } {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return { error: 'uploaded_attachments must be an array' };
  if (value.length > MAX_UPLOAD_FILES) {
    return { error: `At most ${MAX_UPLOAD_FILES} attachments are allowed` };
  }
  const attachments: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Each attachment must be an object' };
    }
    const record = item as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    if (!/^emails\/attachments\/[^/]+\/[^/]+$/.test(key)) {
      return { error: 'Invalid attachment key' };
    }
    const filename = typeof record.filename === 'string' ? record.filename.trim().slice(0, 300) : '';
    if (!filename) return { error: 'Attachment filename is required' };
    const contentType =
      typeof record.contentType === 'string'
        ? record.contentType.trim().slice(0, 200)
        : 'application/octet-stream';
    const size = Number(record.size);
    if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      return { error: 'Invalid attachment size' };
    }
    attachments.push({ key, filename, content_type: contentType, size });
  }
  return attachments;
}

function user(c: Context) {
  return consoleUserFromContext(c);
}

async function mailboxFor(c: Context): Promise<WorkerMailbox | null> {
  const current = user(c);
  if (!current) return null;
  return await ensureMailbox(current.email, current.name);
}

adminMailRouter.post('/admin/mail/attachments/sign', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawName = typeof body.filename === 'string' ? body.filename.trim() : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
  const size = Number(body.size);
  if (!rawName) return c.json({ error: 'filename is required' }, 400);
  if (!contentType || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(contentType)) {
    return c.json({ error: 'contentType is required' }, 400);
  }
  if (!Number.isInteger(size) || size <= 0) {
    return c.json({ error: 'size must be a positive integer' }, 400);
  }
  if (size > MAX_UPLOAD_BYTES) {
    return c.json({ error: `Attachments must be ${MAX_UPLOAD_BYTES} bytes or smaller` }, 413);
  }

  const safeName =
    rawName
      .replace(/[^\w.\-() ]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(-180) || 'attachment';
  const key = `emails/attachments/${mailbox.id}/${crypto.randomUUID()}-${safeName}`;

  try {
    const uploadUrl = await getSignedUploadUrl(key, contentType);
    return c.json({ key, uploadUrl, filename: safeName, contentType, size }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign failed';
    const status = message.includes('not configured') ? 503 : 500;
    return c.json({ error: message }, status as 400 | 500 | 503);
  }
});

function readAddresses(value: unknown, field: string, required: boolean): string[] | { error: string } {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `${field} is required` } : [];
  }
  const raw = Array.isArray(value) ? value : String(value).split(/[,;]/);
  const addresses: string[] = [];
  for (const item of raw) {
    const email = String(item).trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: `${field} contains an invalid address: ${email}` };
    }
    if (!addresses.includes(email)) addresses.push(email);
  }
  if (addresses.length > 50) return { error: `${field} accepts at most 50 addresses` };
  if (required && addresses.length === 0) return { error: `${field} is required` };
  return addresses;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 2_000_000) : '';
}

function publicMailbox(mailbox: WorkerMailbox) {
  return mailbox;
}

adminMailRouter.get('/admin/mail/mailbox', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ mailbox: publicMailbox(mailbox) });
});

adminMailRouter.get('/admin/mail/storage', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await mailboxStorage(mailbox.id));
});

adminMailRouter.get('/admin/mail/emails', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const direction = c.req.query('direction');
  const trashed = c.req.query('trashed') || 'false';
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 40), 1), 100);
  const offset = Math.max(Number(c.req.query('offset') || 0), 0);
  if (direction && !['inbound', 'outbound'].includes(direction)) {
    return c.json({ error: 'direction must be inbound or outbound' }, 400);
  }
  if (!['true', 'false', 'all'].includes(trashed)) {
    return c.json({ error: 'trashed must be true, false or all' }, 400);
  }
  const result = await listMailboxEmails(mailbox.id, {
    direction,
    trashed,
    q: q || undefined,
    limit,
    offset,
  });
  return c.json(result);
});

adminMailRouter.get('/admin/mail/emails/:id', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const result = await getWorkerEmail(c.req.param('id'));
  if (result.email.mailbox_id !== mailbox.id) return c.json({ error: 'Email not found' }, 404);
  return c.json(result);
});

adminMailRouter.get('/admin/mail/emails/:id/attachments/:attachmentId', async (c) => {
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const email = await getWorkerEmail(c.req.param('id'));
  if (email.email.mailbox_id !== mailbox.id) return c.json({ error: 'Email not found' }, 404);
  const response = await mailWorkerResponse(
    `/api/emails/${encodeURIComponent(c.req.param('id'))}/attachments/${encodeURIComponent(c.req.param('attachmentId'))}`,
  );
  if (!response.ok) {
    return c.json({ error: response.status === 404 ? 'Attachment not found' : 'Attachment fetch failed' }, response.status as 404);
  }
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, { status: 200, headers });
});

adminMailRouter.post('/admin/mail/send', async (c) => {
  const current = user(c);
  if (!current) return c.json({ error: 'Unauthorized' }, 401);
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const to = readAddresses(body.to, 'to', true);
  if (!Array.isArray(to)) return c.json({ error: to.error }, 400);
  const cc = readAddresses(body.cc, 'cc', false);
  if (!Array.isArray(cc)) return c.json({ error: cc.error }, 400);
  const bcc = readAddresses(body.bcc, 'bcc', false);
  if (!Array.isArray(bcc)) return c.json({ error: bcc.error }, 400);
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 2000) : '';
  const text = readText(body.text);
  const html = readText(body.html);
  if (!subject) return c.json({ error: 'subject is required' }, 400);
  if (!text && !html) return c.json({ error: 'Message body is required' }, 400);
  const uploadedAttachments = readUploadedAttachments(body.uploaded_attachments);
  if (!Array.isArray(uploadedAttachments)) {
    return c.json({ error: uploadedAttachments.error }, 400);
  }

  const result = await sendWorkerEmail({
    mailbox_id: mailbox.id,
    from: { email: current.email, name: current.name || current.email },
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    uploaded_attachments: uploadedAttachments,
  });
  return c.json(result, 201);
});

adminMailRouter.post('/admin/mail/emails/:id/reply', async (c) => {
  const current = user(c);
  if (!current) return c.json({ error: 'Unauthorized' }, 401);
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const original = await getWorkerEmail(c.req.param('id'));
  if (original.email.mailbox_id !== mailbox.id) return c.json({ error: 'Email not found' }, 404);
  if (original.email.direction !== 'inbound') return c.json({ error: 'Reply is only available for received mail' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const cc = readAddresses(body.cc, 'cc', false);
  if (!Array.isArray(cc)) return c.json({ error: cc.error }, 400);
  const bcc = readAddresses(body.bcc, 'bcc', false);
  if (!Array.isArray(bcc)) return c.json({ error: bcc.error }, 400);
  const text = readText(body.text);
  const html = readText(body.html);
  if (!text && !html) return c.json({ error: 'Reply body is required' }, 400);
  const uploadedAttachments = readUploadedAttachments(body.uploaded_attachments);
  if (!Array.isArray(uploadedAttachments)) {
    return c.json({ error: uploadedAttachments.error }, 400);
  }
  const result = await replyWorkerEmail(c.req.param('id'), {
    mailbox_id: mailbox.id,
    from: { email: current.email, name: current.name || current.email },
    cc,
    bcc,
    text,
    html,
    uploaded_attachments: uploadedAttachments,
  });
  return c.json(result, 201);
});

adminMailRouter.post('/admin/mail/emails/:id/forward', async (c) => {
  const current = user(c);
  if (!current) return c.json({ error: 'Unauthorized' }, 401);
  const mailbox = await mailboxFor(c);
  if (!mailbox) return c.json({ error: 'Unauthorized' }, 401);
  const original = await getWorkerEmail(c.req.param('id'));
  if (original.email.mailbox_id !== mailbox.id) return c.json({ error: 'Email not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const to = readAddresses(body.to, 'to', true);
  if (!Array.isArray(to)) return c.json({ error: to.error }, 400);
  const cc = readAddresses(body.cc, 'cc', false);
  if (!Array.isArray(cc)) return c.json({ error: cc.error }, 400);
  const bcc = readAddresses(body.bcc, 'bcc', false);
  if (!Array.isArray(bcc)) return c.json({ error: bcc.error }, 400);
  const uploadedAttachments = readUploadedAttachments(body.uploaded_attachments);
  if (!Array.isArray(uploadedAttachments)) {
    return c.json({ error: uploadedAttachments.error }, 400);
  }
  const result = await forwardWorkerEmail(c.req.param('id'), {
    mailbox_id: mailbox.id,
    from: { email: current.email, name: current.name || current.email },
    to,
    cc,
    bcc,
    text: readText(body.text),
    html: readText(body.html),
    uploaded_attachments: uploadedAttachments,
  });
  return c.json(result, 201);
});

adminMailRouter.onError((error, c) => {
  if (error instanceof MailWorkerError) return c.json({ error: error.message }, error.status as 400);
  return c.json({ error: 'Mail request failed' }, 500);
});
