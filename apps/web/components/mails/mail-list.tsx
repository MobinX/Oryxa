import Link from 'next/link';
import { Suspense } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Mail,
  Paperclip,
  Search,
  Send,
} from 'lucide-react';
import { consoleApiFetch } from '@/lib/console-session';
import { formatMailBytes, formatMailDate, mailInitial } from '@/lib/mail-format';
import { mailHref, type MailFolder } from '@/lib/mail-query';
import type { MailListResponse } from '@/lib/mail-types';

const FOLDERS: Array<{ key: MailFolder; label: string; icon: typeof Inbox }> = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'all', label: 'All', icon: Mail },
];

export function MailListPane({
  folder,
  q,
  offset,
  selectedId,
}: {
  folder: MailFolder;
  q: string;
  offset: number;
  selectedId?: string;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 p-3">
        <div className="flex rounded-xl bg-muted/50 p-1">
          {FOLDERS.map((tab) => {
            const Icon = tab.icon;
            const active = folder === tab.key;
            return (
              <Link
                key={tab.key}
                href={mailHref({ folder: tab.key, q })}
                aria-current={active ? 'page' : undefined}
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
        <form action="/mails" method="get" className="mt-2 flex gap-2">
          <input type="hidden" name="folder" value={folder} />
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
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

      <Suspense key={`${folder}:${q}:${offset}`} fallback={<MailListSkeleton />}>
        <MailListRows folder={folder} q={q} offset={offset} selectedId={selectedId} />
      </Suspense>
    </div>
  );
}

async function MailListRows({
  folder,
  q,
  offset,
  selectedId,
}: {
  folder: MailFolder;
  q: string;
  offset: number;
  selectedId?: string;
}) {
  let list: MailListResponse;
  try {
    const query = new URLSearchParams({ limit: '40', offset: String(offset), trashed: 'false' });
    if (folder === 'inbox') query.set('direction', 'inbound');
    if (folder === 'sent') query.set('direction', 'outbound');
    if (q) query.set('q', q);
    list = await consoleApiFetch<MailListResponse>(`/api2/admin/mail/emails?${query.toString()}`);
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'The mailbox could not be loaded';
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-semibold">The mailbox could not be loaded.</p>
          <p className="mt-0.5">{message}</p>
          <p className="mt-1 text-xs">Please try again.</p>
          <Link
            href={mailHref({ folder, q })}
            className="mt-3 inline-block text-xs font-semibold underline"
          >
            Reload
          </Link>
        </div>
      </div>
    );
  }

  const rows = list.emails;
  const total = list.total;
  const limit = list.limit;

  return (
    <>
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
                  href={mailHref({ folder, id: row.id, q, offset })}
                  className={`block px-4 py-3 transition-colors hover:bg-muted/40 ${
                    selectedId === row.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {mailInitial(row.direction === 'outbound' ? row.to_email : row.from.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold">
                          {row.direction === 'outbound' ? 'To: ' : ''}
                          {row.direction === 'outbound'
                            ? row.to_email
                            : row.from.name || row.from.email}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatMailDate(row.received_at || row.created_at)}
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
                        <span>{formatMailBytes(row.size_bytes)}</span>
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
            href={mailHref({ folder, q, offset: Math.max(offset - limit, 0) })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Newer
          </Link>
        ) : (
          <span />
        )}
        {offset + limit < total ? (
          <Link
            href={mailHref({ folder, q, offset: offset + limit })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            Older <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

export function MailListPaneSkeleton() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="space-y-2 border-b border-border/50 p-3">
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
          <span className="h-7 flex-1 animate-pulse rounded-lg bg-muted" />
          <span className="h-7 flex-1 animate-pulse rounded-lg bg-muted/70" />
          <span className="h-7 flex-1 animate-pulse rounded-lg bg-muted/70" />
        </div>
        <div className="h-9 animate-pulse rounded-lg bg-muted/70" />
      </div>
      <MailListSkeleton />
    </div>
  );
}

export function MailListSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <span className="h-3 w-28 animate-pulse rounded bg-muted" />
        <span className="h-3 w-8 animate-pulse rounded bg-muted/70" />
      </div>
      <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex items-start gap-3 border-b border-border/40 px-4 py-3">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="h-3 w-32 animate-pulse rounded bg-muted" />
                <span className="h-3 w-14 shrink-0 animate-pulse rounded bg-muted/70" />
              </div>
              <span className="mt-2 block h-4 w-3/4 animate-pulse rounded bg-muted" />
              <span className="mt-2 block h-3 w-20 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
        <span className="h-3 w-12 animate-pulse rounded bg-muted/60" />
        <span className="h-3 w-12 animate-pulse rounded bg-muted/60" />
      </div>
      <span className="sr-only">Loading emails</span>
    </div>
  );
}
