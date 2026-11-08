import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CornerUpLeft,
  Download,
  Forward,
  Paperclip,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { AttachmentUploadProvider, MailAttachmentField } from '@/components/mail-attachments';
import { MailSubmitButton } from '@/components/mail-submit-button';
import {
  deleteMailAction,
  forwardMailAction,
  replyMailAction,
  restoreMailAction,
  trashMailAction,
} from '@/app/mails/actions';
import { consoleApiFetch, ConsoleApiError } from '@/lib/console-session';
import {
  formatMailBytes,
  formatMailDate,
  mailAddressLine,
  mailInitial,
} from '@/lib/mail-format';
import { mailHref, type MailFolder } from '@/lib/mail-query';
import type { MailDetailResponse } from '@/lib/mail-types';

export async function MailMessage({
  id,
  folder,
  q,
  offset,
}: {
  id: string;
  folder: MailFolder;
  q: string;
  offset: number;
}) {
  let detail: MailDetailResponse;
  try {
    detail = await consoleApiFetch<MailDetailResponse>(
      `/api2/admin/mail/emails/${encodeURIComponent(id)}`,
      // Bodies are immutable; trash/restore/delete actions purge this path.
      { next: { revalidate: 60 } },
    );
  } catch (failure) {
    if (failure instanceof ConsoleApiError && failure.status === 401) redirect('/mails/login');
    const message = failure instanceof Error ? failure.message : 'This email could not be opened';
    return (
      <div className="p-0.5">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">This email could not be opened.</p>
            <p className="mt-0.5 break-words text-[13px]">{message}</p>
            <Link
              href={mailHref({ folder, q, offset })}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 text-xs font-semibold outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { email, content: body } = detail;

  return (
    <div className="space-y-3 p-0.5">
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Link
          href={mailHref({ folder, q, offset })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
        </Link>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatMailDate(email.received_at || email.created_at)}
        </span>
      </div>

      <article className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <header className="border-b border-border/50 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span
              className={`rounded-full px-2 py-px text-[10px] font-semibold uppercase tracking-wider ${
                email.direction === 'inbound'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {email.direction === 'inbound' ? 'received' : 'sent'}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatMailDate(email.received_at || email.created_at)}
            </span>
            {email.attachment_count > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" aria-hidden /> {email.attachment_count} file
                {email.attachment_count === 1 ? '' : 's'}
              </span>
            ) : null}
            {email.is_spam ? (
              <span
                title={email.spam_reason ? `Spam signals: ${email.spam_reason}` : 'Flagged as spam'}
                className="rounded-full bg-amber-500/15 px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400"
              >
                spam{typeof email.spam_score === 'number' ? ` ${email.spam_score}/10` : ''}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1.5">
              {email.is_trashed ? (
                <>
                  <form action={restoreMailAction}>
                    <input type="hidden" name="id" value={email.id} />
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> Restore
                    </button>
                  </form>
                  <form action={deleteMailAction}>
                    <input type="hidden" name="id" value={email.id} />
                    <input type="hidden" name="folder" value={folder} />
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-destructive/30 bg-background px-2.5 text-[11px] font-semibold text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden /> Delete forever
                    </button>
                  </form>
                </>
              ) : (
                <form action={trashMailAction}>
                  <input type="hidden" name="id" value={email.id} />
                  <input type="hidden" name="folder" value={folder} />
                  <button
                    type="submit"
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden /> Trash
                  </button>
                </form>
              )}
            </span>
          </div>

          <h1 className="mt-3 break-words text-lg font-semibold leading-snug tracking-tight sm:text-xl">
            {body?.subject || email.subject || '(no subject)'}
          </h1>

          <div className="mt-4 flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
            >
              {mailInitial(body?.from.email || email.from.email)}
            </span>
            <dl className="min-w-0 break-words text-xs leading-relaxed">
              <div className="flex flex-wrap gap-x-1.5">
                <dt className="sr-only">From</dt>
                <dd className="font-semibold text-foreground">
                  {body
                    ? mailAddressLine([body.from])
                    : `${email.from.name || email.from.email} <${email.from.email}>`}
                </dd>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-1.5">
                <dt className="text-muted-foreground">To</dt>
                <dd className="font-medium text-foreground">
                  {body ? mailAddressLine(body.to) : email.to_email}
                </dd>
              </div>
              {body?.cc.length ? (
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">CC</dt>
                  <dd className="font-medium text-foreground">{mailAddressLine(body.cc)}</dd>
                </div>
              ) : null}
              {body?.bcc.length ? (
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">BCC</dt>
                  <dd className="font-medium text-foreground">{mailAddressLine(body.bcc)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          {body?.html ? (
            <iframe
              title="Email content"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={body.html}
              className="h-[min(28rem,58dvh)] w-full rounded-lg border border-border bg-white"
            />
          ) : (
            <pre className="max-h-[min(30rem,60dvh)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 p-4 font-sans text-sm leading-relaxed">
              {body?.text || 'No message body was stored.'}
            </pre>
          )}

          {body?.attachments.length ? (
            <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{' '}
                {body.attachments.length} attachment{body.attachments.length === 1 ? '' : 's'}
              </p>
              <ul className="space-y-1">
                {body.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={`/api/admin/mail/attachments/${encodeURIComponent(email.id)}/${encodeURIComponent(attachment.id)}`}
                      download={attachment.filename}
                      className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-xs outline-none transition-colors hover:border-border/60 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Download className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {attachment.filename}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatMailBytes(attachment.size)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </article>

      {email.direction === 'inbound' ? (
        <details className="group rounded-xl border border-border/60 bg-card shadow-sm open:p-4 open:sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-4 text-sm font-semibold outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring group-open:rounded-none group-open:p-0 group-open:hover:bg-transparent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CornerUpLeft className="h-4 w-4" aria-hidden />
            </span>
            Reply
            <ChevronDown
              className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <AttachmentUploadProvider>
            <form action={replyMailAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={email.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1.5 block font-semibold">CC</span>
                <input
                  name="cc"
                  type="text"
                  placeholder="Optional"
                  autoComplete="off"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1.5 block font-semibold">BCC</span>
                <input
                  name="bcc"
                  type="text"
                  placeholder="Optional"
                  autoComplete="off"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
                />
              </label>
            </div>
            <textarea
              name="text"
              required
              rows={5}
              placeholder={`Reply to ${body?.from.email || email.from.email}…`}
              className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
            />
            <MailAttachmentField />
            <MailSubmitButton
              label="Send reply"
              pendingLabel="Sending reply…"
              icon="reply"
              size="sm"
            />
            </form>
          </AttachmentUploadProvider>
        </details>
      ) : null}

      <details className="group rounded-xl border border-border/60 bg-card shadow-sm open:p-4 open:sm:p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-4 text-sm font-semibold outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring group-open:rounded-none group-open:p-0 group-open:hover:bg-transparent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Forward className="h-4 w-4" aria-hidden />
          </span>
          Forward
          <ChevronDown
            className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <AttachmentUploadProvider>
          <form action={forwardMailAction} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={email.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">To</span>
              <input
                name="to"
                required
                placeholder="recipient@example.com"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">CC</span>
              <input
                name="cc"
                placeholder="Optional"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">BCC</span>
              <input
                name="bcc"
                placeholder="Optional"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">Note</span>
              <input
                name="text"
                placeholder="Optional note above the forwarded content"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
              />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Original attachments are copied into the forwarded message.
          </p>
          <MailAttachmentField />
          <MailSubmitButton
            label="Forward message"
            pendingLabel="Forwarding…"
            icon="forward"
            size="sm"
          />
          </form>
        </AttachmentUploadProvider>
      </details>

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground">
        Stored in the same mailbox as the admin console. Content is streamed from private storage
        only after this session is checked.
      </p>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3 p-0.5 [&_.animate-pulse]:motion-reduce:animate-none"
    >
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="mt-3 h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
        <div className="mt-5 h-[min(28rem,58dvh)] w-full animate-pulse rounded-xl bg-muted/60" />
      </div>
      <div className="h-14 animate-pulse rounded-xl border border-border/60 bg-card" />
      <div className="h-14 animate-pulse rounded-xl border border-border/60 bg-card" />
      <span className="sr-only">Loading message</span>
    </div>
  );
}
