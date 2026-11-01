import Link from 'next/link';
import { PenLine } from 'lucide-react';
import { MailSubmitButton } from '@/components/mail-submit-button';
import { sendMailAction } from '@/app/mails/actions';
import { mailHref, type MailFolder } from '@/lib/mail-query';

const FIELD =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';

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
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PenLine className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-semibold">New message</h1>
              <p className="text-xs text-muted-foreground">Sent from your admin mailbox.</p>
            </div>
          </div>
          <Link
            href={mailHref({ folder, q, offset })}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Link>
        </div>

        <form action={sendMailAction} className="space-y-3 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">To</span>
              <input
                name="to"
                type="text"
                required
                placeholder="customer@example.com, another@example.com"
                className={FIELD}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">CC</span>
              <input name="cc" type="text" placeholder="Optional, comma-separated" className={FIELD} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">BCC</span>
              <input name="bcc" type="text" placeholder="Optional, comma-separated" className={FIELD} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">Subject</span>
              <input name="subject" type="text" required className={FIELD} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">Message</span>
            <textarea name="text" required rows={12} className={FIELD} />
          </label>
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              The sent copy and its attachments are stored in the same mailbox.
            </p>
            <MailSubmitButton label="Send message" pendingLabel="Sending…" icon="send" />
          </div>
        </form>
      </div>
    </div>
  );
}
