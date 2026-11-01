import Link from 'next/link';
import { ArrowLeft, CornerUpLeft, Forward, Paperclip } from 'lucide-react';
import { MailSubmitButton } from '@/components/mail-submit-button';
import { forwardMailAction, replyMailAction } from '@/app/mails/actions';
import { consoleApiFetch } from '@/lib/console-session';
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
    );
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'This email could not be opened';
    return (
      <div className="p-1">
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
        >
          <p className="font-semibold">This email could not be opened.</p>
          <p className="mt-0.5">{message}</p>
          <p className="mt-1 text-xs">Please try again.</p>
          <Link
            href={mailHref({ folder, q, offset })}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the list
          </Link>
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
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <span className="text-[10px] text-muted-foreground">
          {formatMailDate(email.received_at || email.created_at)}
        </span>
      </div>

      <article className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <header className="border-b border-border/50 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                email.direction === 'inbound'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {email.direction === 'inbound' ? 'received' : 'sent'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatMailDate(email.received_at || email.created_at)}
            </span>
            {email.attachment_count > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Paperclip className="h-3 w-3" /> {email.attachment_count}
              </span>
            ) : null}
          </div>

          <h1 className="mt-2 break-words text-lg font-bold leading-tight sm:text-xl">
            {body?.subject || email.subject || '(no subject)'}
          </h1>

          <div className="mt-4 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {mailInitial(body?.from.email || email.from.email)}
            </span>
            <div className="min-w-0 break-words text-xs">
              <p className="font-semibold text-foreground">
                {body
                  ? mailAddressLine([body.from])
                  : `${email.from.name || email.from.email} <${email.from.email}>`}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                To{' '}
                <span className="font-medium text-foreground">
                  {body ? mailAddressLine(body.to) : email.to_email}
                </span>
              </p>
              {body?.cc.length ? (
                <p className="text-muted-foreground">
                  CC <span className="font-medium text-foreground">{mailAddressLine(body.cc)}</span>
                </p>
              ) : null}
              {body?.bcc.length ? (
                <p className="text-muted-foreground">
                  BCC{' '}
                  <span className="font-medium text-foreground">{mailAddressLine(body.bcc)}</span>
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          {body?.html ? (
            <iframe
              title="Email content"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={body.html}
              className="h-[min(28rem,58dvh)] w-full rounded-xl border border-border bg-white"
            />
          ) : (
            <pre className="max-h-[min(30rem,60dvh)] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 text-sm leading-relaxed">
              {body?.text || 'No message body was stored.'}
            </pre>
          )}

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
                      <span className="shrink-0 text-muted-foreground">
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
            <MailSubmitButton
              label="Send reply"
              pendingLabel="Sending reply…"
              icon="reply"
              size="sm"
            />
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
            Original attachments are copied into the forwarded message.
          </p>
          <MailSubmitButton
            label="Forward message"
            pendingLabel="Forwarding…"
            icon="forward"
            size="sm"
          />
        </form>
      </details>

      <p className="px-2 pb-2 text-[10px] text-muted-foreground">
        Stored in the same mailbox as the admin console. Content is streamed from private
        storage only after this session is checked.
      </p>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3 p-0.5">
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
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
      <div className="h-14 animate-pulse rounded-2xl border border-border/60 bg-card" />
      <span className="sr-only">Loading message</span>
    </div>
  );
}
