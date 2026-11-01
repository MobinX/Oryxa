import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Forward,
  Inbox,
  Mail,
  Paperclip,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin-page-header';
import { consoleApiFetch, requireConsoleUser } from '@/lib/console-session';
import { consoleCan } from '@/lib/console-capabilities';
import type {
  MailAddress,
  MailContent,
  MailDetailResponse,
  MailListResponse,
  MailRow,
  Mailbox,
} from '@/lib/mail-types';
import { forwardMailAction, replyMailAction, sendMailAction } from './actions';

export const instant = false;

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function addressLine(addresses: MailAddress[]): string {
  return addresses.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');
}

function hrefFor(input: {
  folder?: string;
  id?: string;
  compose?: boolean;
  q?: string;
  offset?: number;
}): string {
  const params = new URLSearchParams();
  if (input.folder && input.folder !== 'inbox') params.set('folder', input.folder);
  if (input.id) params.set('id', input.id);
  if (input.compose) params.set('compose', '1');
  if (input.q) params.set('q', input.q);
  if (input.offset) params.set('offset', String(input.offset));
  const suffix = params.toString();
  return `/admin/inbox${suffix ? `?${suffix}` : ''}`;
}

function initial(value: string): string {
  return (value.trim()[0] || '?').toUpperCase();
}

export default async function AdminInboxPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireConsoleUser();
  if (!consoleCan(user, 'inbox')) redirect('/admin');

  const params = await searchParams;
  const folderParam = one(params.folder);
  const folder = folderParam === 'sent' ? 'sent' : folderParam === 'all' ? 'all' : 'inbox';
  const selectedId = one(params.id);
  const compose = one(params.compose) === '1';
  const queryText = one(params.q) || '';
  const offset = Math.max(Number(one(params.offset) || 0), 0);
  const error = one(params.error);
  const sent = one(params.sent) === '1';

  let mailbox: Mailbox | null = null;
  let list: MailListResponse | null = null;
  let detail: MailDetailResponse | null = null;
  let loadError: string | null = null;
  let detailError: string | null = null;

  try {
    const mailboxData = await consoleApiFetch<{ mailbox: Mailbox }>('/api2/admin/mail/mailbox');
    mailbox = mailboxData.mailbox;
    const query = new URLSearchParams({
      limit: '40',
      offset: String(offset),
      trashed: 'false',
    });
    if (folder === 'inbox') query.set('direction', 'inbound');
    if (folder === 'sent') query.set('direction', 'outbound');
    if (queryText) query.set('q', queryText);
    list = await consoleApiFetch<MailListResponse>(`/api2/admin/mail/emails?${query.toString()}`);
    if (selectedId) {
      try {
        detail = await consoleApiFetch<MailDetailResponse>(
          `/api2/admin/mail/emails/${encodeURIComponent(selectedId)}`,
        );
      } catch (detailFailure) {
        detailError =
          detailFailure instanceof Error ? detailFailure.message : 'This email could not be opened';
      }
    }
  } catch (failure) {
    loadError = failure instanceof Error ? failure.message : 'Inbox could not be loaded';
  }

  const activePane = Boolean(selectedId || compose);
  const rows = list?.emails || [];
  const total = list?.total || 0;
  const limit = list?.limit || 40;

  return (
    <div className="space-y-4 sm:space-y-6">
      <AdminPageHeader
        icon={Mail}
        title="Inbox"
        description={
          <span>
            <code>{mailbox?.address || user.email}</code> · sent and received mail, forwarded with
            its attachments.
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={hrefFor({ folder, id: selectedId, compose: true, q: queryText })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Compose
            </Link>
            <Link
              href={hrefFor({ folder, q: queryText })}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Refresh
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {sent ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Message sent and stored in Sent.
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {loadError}
        </div>
      ) : (
        <div className="grid min-h-[60vh] gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <section className={activePane ? 'hidden lg:block' : 'block'}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border/50 p-3">
                <div className="flex rounded-xl bg-muted/50 p-1">
                  {[
                    { key: 'inbox', label: 'Inbox', icon: Inbox },
                    { key: 'sent', label: 'Sent', icon: Send },
                    { key: 'all', label: 'All', icon: Mail },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = folder === tab.key;
                    return (
                      <Link
                        key={tab.key}
                        href={hrefFor({ folder: tab.key, q: queryText })}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
                <form action="/admin/inbox" method="get" className="mt-2 flex gap-2">
                  <input type="hidden" name="folder" value={folder} />
                  <label className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      name="q"
                      defaultValue={queryText}
                      placeholder="Search subject or sender"
                      className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Search
                  </button>
                </form>
              </div>

              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
                <span>
                  {total} message{total === 1 ? '' : 's'} · {folder}
                </span>
                <span>UTC</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {rows.length === 0 ? (
                  <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                    <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    No mail in this folder yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <Link
                          href={hrefFor({ folder, id: row.id, q: queryText })}
                          className={`block px-4 py-3 transition-colors hover:bg-muted/40 ${
                            selectedId === row.id ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {initial(row.direction === 'outbound' ? row.to_email : row.from.email)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-xs font-semibold">
                                  {row.direction === 'outbound' ? 'To: ' : ''}
                                  {row.direction === 'outbound' ? row.to_email : row.from.name || row.from.email}
                                </p>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {formatDate(row.received_at || row.created_at)}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-sm font-medium">
                                {row.subject || '(no subject)'}
                              </p>
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 font-bold uppercase tracking-wide ${
                                    row.direction === 'inbound'
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {row.direction === 'inbound' ? 'received' : 'sent'}
                                </span>
                                {row.attachment_count > 0 ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Paperclip className="h-3 w-3" />
                                    {row.attachment_count}
                                  </span>
                                ) : null}
                                <span>{formatBytes(row.size_bytes)}</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                {offset > 0 ? (
                  <Link
                    href={hrefFor({ folder, q: queryText, offset: Math.max(offset - limit, 0) })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Newer
                  </Link>
                ) : (
                  <span />
                )}
                {offset + limit < total ? (
                  <Link
                    href={hrefFor({ folder, q: queryText, offset: offset + limit })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    Older <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </div>
          </section>

          <section className={activePane ? 'block' : 'hidden lg:block'}>
            {compose ? (
              <ComposePane folder={folder} queryText={queryText} />
            ) : detail ? (
              <MessagePane detail={detail} folder={folder} queryText={queryText} detailError={detailError} />
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                <Mail className="mb-3 h-9 w-9 text-muted-foreground/50" />
                <p className="text-sm font-semibold">Select a message</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Open a received or sent message, or compose a new one. Attachments stay in B2 and
                  are streamed only after your console session is checked.
                </p>
                {detailError ? (
                  <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {detailError}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ComposePane({ folder, queryText }: { folder: string; queryText: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">New message</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Sent through Brevo from your admin mail.</p>
        </div>
        <Link
          href={hrefFor({ folder, q: queryText })}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          Cancel
        </Link>
      </div>

      <form action={sendMailAction} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">To</span>
            <input
              name="to"
              type="text"
              required
              placeholder="customer@example.com, another@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">CC</span>
            <input
              name="cc"
              type="text"
              placeholder="Optional, comma-separated"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">BCC</span>
            <input
              name="bcc"
              type="text"
              placeholder="Optional, comma-separated"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">Subject</span>
            <input
              name="subject"
              type="text"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">Message</span>
          <textarea
            name="text"
            required
            rows={10}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Send message
        </button>
      </form>
    </div>
  );
}

function MessagePane({
  detail,
  folder,
  queryText,
  detailError,
}: {
  detail: MailDetailResponse;
  folder: string;
  queryText: string;
  detailError: string | null;
}) {
  const { email, content } = detail;
  const body = content;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Link
            href={hrefFor({ folder, q: queryText })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <span className="text-[10px] text-muted-foreground">{formatDate(email.received_at || email.created_at)}</span>
        </div>

        {detailError ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {detailError}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  email.direction === 'inbound' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {email.direction === 'inbound' ? 'received' : 'sent'}
              </span>
              <span className="text-[10px] text-muted-foreground">{formatDate(email.received_at || email.created_at)}</span>
            </div>
            <h2 className="mt-2 text-lg font-bold leading-tight sm:text-xl">
              {body?.subject || email.subject || '(no subject)'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              From <span className="font-medium text-foreground">{body ? addressLine([body.from]) : `${email.from.name || email.from.email} <${email.from.email}>`}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              To <span className="font-medium text-foreground">{body ? addressLine(body.to) : email.to_email}</span>
            </p>
            {body?.cc.length ? (
              <p className="text-xs text-muted-foreground">
                CC <span className="font-medium text-foreground">{addressLine(body.cc)}</span>
              </p>
            ) : null}
            {body?.bcc.length ? (
              <p className="text-xs text-muted-foreground">
                BCC <span className="font-medium text-foreground">{addressLine(body.bcc)}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          {body?.html ? (
            <iframe
              title="Email content"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={body.html}
              className="h-[28rem] w-full rounded-xl border border-border bg-white"
            />
          ) : (
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm">
              {body?.text || 'No message body was stored.'}
            </pre>
          )}
        </div>

        {body?.attachments.length ? (
          <div className="mt-4 rounded-xl border border-border/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Paperclip className="h-3.5 w-3.5" /> {body.attachments.length} attachment
              {body.attachments.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-1">
              {body.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={`/api/admin/mail/attachments/${encodeURIComponent(email.id)}/${encodeURIComponent(attachment.id)}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="truncate font-medium">{attachment.filename}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {email.direction === 'inbound' ? (
        <details className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <CornerUpLeft className="h-4 w-4 text-primary" /> Reply
          </summary>
          <form action={replyMailAction} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={email.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1 block font-semibold">CC</span>
                <input
                  name="cc"
                  type="text"
                  placeholder="Optional"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold">BCC</span>
                <input
                  name="bcc"
                  type="text"
                  placeholder="Optional"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
            <textarea
              name="text"
              required
              rows={5}
              placeholder={`Reply to ${body?.from.email || email.from.email}…`}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <CornerUpLeft className="h-3.5 w-3.5" /> Send reply
            </button>
          </form>
        </details>
      ) : null}

      <details className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Forward className="h-4 w-4 text-primary" /> Forward
        </summary>
        <form action={forwardMailAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={email.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">To</span>
              <input
                name="to"
                required
                placeholder="recipient@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">CC</span>
              <input
                name="cc"
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">BCC</span>
              <input
                name="bcc"
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">Note</span>
              <input
                name="text"
                placeholder="Optional note above the forwarded content"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Original attachments are copied from B2 into the forwarded message.
          </p>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Forward className="h-3.5 w-3.5" /> Forward message
          </button>
        </form>
      </details>
    </div>
  );
}
