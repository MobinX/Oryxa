import { Mail } from 'lucide-react';

/**
 * The dedicated mail console's two-pane frame. On phones only one pane is on screen at a
 * time; desktop always shows the list beside the reader. Every pane is a viewport-bounded
 * scroll container so long mail never stretches the page.
 */
export function MailShell({
  mode,
  list,
  detail,
}: {
  mode: 'list' | 'detail';
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <section
        className={
          mode === 'detail' ? 'hidden min-h-0 min-w-0 lg:block' : 'block min-h-0 min-w-0'
        }
      >
        {list}
      </section>
      <section
        className={
          mode === 'list' ? 'hidden min-h-0 min-w-0 lg:block' : 'block min-h-0 min-w-0'
        }
      >
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">{detail}</div>
      </section>
    </div>
  );
}

export function EmptyMailDetail() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Mail className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold">Select a message</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        This is the same mailbox your admin console uses. Mail is read here; the console stays the
        place for managing it.
      </p>
    </div>
  );
}
