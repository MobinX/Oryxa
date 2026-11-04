import Link from 'next/link';
import { PenLine } from 'lucide-react';
import { AttachmentUploadProvider, MailAttachmentField } from '@/components/mail-attachments';
import { MailSubmitButton } from '@/components/mail-submit-button';
import { sendMailAction } from '@/app/mails/actions';
import { mailHref, type MailFolder } from '@/lib/mail-query';

const FIELD =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none';

export function MailCompose({
  folder,
  q,
  offset,
}: {
  folder: MailFolder;
  q: string;
  offset: number;
}) {
  return (
    <div className="p-0.5">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 p-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PenLine className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight">New message</h1>
              <p className="truncate text-xs text-muted-foreground">
                Sent from your admin mailbox.
              </p>
            </div>
          </div>
          <Link
            href={mailHref({ folder, q, offset })}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Cancel
          </Link>
        </div>

        <AttachmentUploadProvider>
          <form action={sendMailAction} className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">
                To <span aria-hidden className="font-normal text-muted-foreground">(required)</span>
              </span>
              <input
                name="to"
                type="text"
                required
                placeholder="customer@example.com, another@example.com"
                autoComplete="off"
                className={FIELD}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">CC</span>
              <input name="cc" type="text" placeholder="Optional, comma-separated" autoComplete="off" className={FIELD} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">BCC</span>
              <input name="bcc" type="text" placeholder="Optional, comma-separated" autoComplete="off" className={FIELD} />
            </label>
            <label className="block text-xs">
              <span className="mb-1.5 block font-semibold">
                Subject <span aria-hidden className="font-normal text-muted-foreground">(required)</span>
              </span>
              <input name="subject" type="text" required placeholder="What is this about?" autoComplete="off" className={FIELD} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1.5 block font-semibold">
              Message <span aria-hidden className="font-normal text-muted-foreground">(required)</span>
            </span>
            <textarea
              name="text"
              required
              rows={12}
              placeholder="Write your message…"
              className={`${FIELD} min-h-48 resize-y leading-relaxed`}
            />
          </label>
          <MailAttachmentField />
          <div className="flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The sent copy and its attachments are stored in the same mailbox.
            </p>
            <MailSubmitButton label="Send message" pendingLabel="Sending…" icon="send" />
          </div>
          </form>
        </AttachmentUploadProvider>
      </div>
    </div>
  );
}
