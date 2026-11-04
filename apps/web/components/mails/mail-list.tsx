import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  ShieldAlert,
  Mail,
  MailSearch,
  Paperclip,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { consoleApiFetch, ConsoleApiError } from '@/lib/console-session';
import { formatMailBytes, formatMailDate, mailInitial } from '@/lib/mail-format';
import { mailHref, type MailFolder } from '@/lib/mail-query';
import type { MailListResponse } from '@/lib/mail-types';

const FOLDERS: Array<{ key: MailFolder; label: string; icon: typeof Inbox }> = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'all', label: 'All', icon: Mail },
  { key: 'trash', label: 'Trash', icon: Trash2 },
  { key: 'spam', label: 'Spam', icon: ShieldAlert },
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 p-3">
        <nav aria-label="Mail folders" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {FOLDERS.map((tab) => {
            const Icon = tab.icon;
            const active = folder === tab.key;
            return (
              <Link
                key={tab.key}
                href={mailHref({ folder: tab.key, q })}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <form action="/mails" method="get" role="search" className="mt-2 flex gap-2">
          <input type="hidden" name="folder" value={folder} />
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search mail</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search subject or sender"
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none"
            />
          </label>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
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
    const trashed = folder === 'trash';
    const query = new URLSearchParams({
      limit: '40',
      offset: String(offset),
      trashed: trashed ? 'true' : 'false',
    });
    if (folder === 'inbox') query.set('direction', 'inbound');
    if (folder === 'sent') query.set('direction', 'outbound');
    if (folder === 'spam') query.set('spam', 'true');
    if (folder === 'inbox' || folder === 'sent') query.set('spam', 'false');
    if (q) query.set('q', q);
    list = await consoleApiFetch<MailListResponse>(`/api2/admin/mail/emails?${query.toString()}`, {
      next: { revalidate: 15 },
    });
  } catch (failure) {
    if (failure instanceof ConsoleApiError && failure.status === 401) redirect('/mails/login');
    const message = failure instanceof Error ? failure.message : 'The mailbox could not be loaded';
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">The mailbox could not be loaded.</p>
            <p className="mt-0.5 break-words text-[13px]">{message}</p>
            <Link
              href={mailHref({ folder, q })}
              className="mt-3 inline-flex h-8 items-center rounded-lg border border-destructive/30 bg-card px-3 text-xs font-semibold outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Try again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const rows = list.emails;
  const total = list.total;
  const limit = list.limit;

  const folderLabel = folder === 'all' ? 'All mail' : folder[0].toUpperCase() + folder.slice(1);
  const EmptyIcon = q ? MailSearch : folder === 'trash' ? Trash2 : Inbox;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          <span className="font-semibold text-foreground">{total}</span> message
          {total === 1 ? '' : 's'} in {folderLabel}
          {q ? (
            <>
              {' '}
              for <span className="font-medium text-foreground">“{q}”</span>
            </>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums">UTC</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <EmptyIcon className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {q
                ? 'No messages match this search'
                : folder === 'trash'
                  ? 'Trash is empty'
                  : `No mail in ${folderLabel.toLowerCase()} yet`}
            </p>
            <p className="mt-1 max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
              {q
                ? 'Try a different sender, subject, or folder.'
                : 'New messages will appear here when they arrive.'}
            </p>
            {q ? (
              <Link
                href={mailHref({ folder })}
                className="mt-4 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                Clear search
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((row) => {
              const selected = selectedId === row.id;
              return (
                <li key={row.id}>
                  <Link
                    href={mailHref({ folder, id: row.id, q, offset })}
                    aria-current={selected ? 'true' : undefined}
                    className={`relative block px-4 py-3 outline-none transition-colors focus-visible:bg-muted/60 motion-reduce:transition-none ${
                      selected ? 'bg-primary/[0.07]' : 'hover:bg-muted/50'
                    }`}
                  >
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                      />
                    ) : null}
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      >
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
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatMailDate(row.received_at || row.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium leading-snug">
                          {row.subject || '(no subject)'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span
                            className={`rounded-full px-1.5 py-px font-semibold uppercase tracking-wider ${
                              row.direction === 'inbound'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {row.direction === 'inbound' ? 'received' : 'sent'}
                          </span>
                          {row.attachment_count > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" aria-hidden />
                              {row.attachment_count}
                            </span>
                          ) : null}
                          <span className="tabular-nums">{formatMailBytes(row.size_bytes)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        {offset > 0 ? (
          <Link
            href={mailHref({ folder, q, offset: Math.max(offset - limit, 0) })}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Newer
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center gap-1 px-2 text-xs font-medium text-muted-foreground/50">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Newer
          </span>
        )}
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {total === 0
            ? '0 of 0'
            : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
        </span>
        {offset + limit < total ? (
          <Link
            href={mailHref({ folder, q, offset: offset + limit })}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Older <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center gap-1 px-2 text-xs font-medium text-muted-foreground/50">
            Older <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

export function MailListPaneSkeleton() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm [&_.animate-pulse]:motion-reduce:animate-none">
      <div className="space-y-2 border-b border-border/50 p-3" aria-hidden="true">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <span className="h-7 flex-1 animate-pulse rounded-md bg-muted" />
          <span className="h-7 flex-1 animate-pulse rounded-md bg-muted" />
          <span className="h-7 flex-1 animate-pulse rounded-md bg-muted" />
          <span className="h-7 flex-1 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-9 animate-pulse rounded-lg bg-muted" />
      </div>
      <MailListSkeleton />
    </div>
  );
}

export function MailListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col [&_.animate-pulse]:motion-reduce:animate-none"
    >
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
