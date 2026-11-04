import Link from 'next/link';
import { Inbox, PenLine } from 'lucide-react';

/**
 * The dedicated mail console's two-pane frame. On phones only one pane is on screen at a
 * time; desktop always shows the list beside the reader. Every pane is a viewport-bounded
 * scroll container so long mail never stretches the page.
 */
export function MailShell({
  mode,
  list,
  detail,
  banner,
}: {
  mode: 'list' | 'detail';
  list: React.ReactNode;
  detail: React.ReactNode;
  banner?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      {banner ? <div className="shrink-0">{banner}</div> : null}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <section
          aria-label="Message list"
          className={
            mode === 'detail' ? 'hidden min-h-0 min-w-0 lg:block' : 'block min-h-0 min-w-0'
          }
        >
          {list}
        </section>
        <section
          aria-label="Reading pane"
          className={
            mode === 'list' ? 'hidden min-h-0 min-w-0 lg:block' : 'block min-h-0 min-w-0'
          }
        >
          <div className="h-full min-h-0 overflow-y-auto overscroll-contain">{detail}</div>
        </section>
      </div>
    </div>
  );
}

export function EmptyMailDetail() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm font-semibold">Select a message to read it</p>
      <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
        This is the same mailbox your admin console uses. Mail is read here; the console stays the
        place for managing it.
      </p>
      <Link
        href="/mails/compose"
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        <PenLine className="h-3.5 w-3.5" aria-hidden />
        New message
      </Link>
    </div>
  );
}
