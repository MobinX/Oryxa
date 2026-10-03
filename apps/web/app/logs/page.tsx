import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AlertTriangle, LogOut, RefreshCw, ScrollText, Search } from 'lucide-react';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';
import { logsSignOutAction } from '@/app/actions/logs-auth';
import {
  ApiError,
  getLogEvents,
  getLogEventTypes,
  type LogEventRow,
  type LogEventTypeOption,
  type LogFilter,
  type LogQueryResult,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SignOutForm } from '@/components/sign-out-button';

const LIMITS = [25, 50, 100, 200];
const HOURS = [1, 6, 24, 72, 168];

type PageOrError = { page?: LogQueryResult; error?: string; status?: number };

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Only what the route understands, and never an empty browser-form value. */
function readFilter(params: RawParams): LogFilter {
  const type = one(params.type);
  const start = one(params.start);
  const end = one(params.end);
  const cursor = one(params.cursor);
  const limit = Number.parseInt(one(params.limit) ?? '', 10);
  return {
    ...(type ? { type } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(cursor ? { cursor } : {}),
    ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
  };
}

function hrefFor(filter: LogFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return `/logs${query ? `?${query}` : ''}`;
}

/** UTC, because every stamped time and every naive bound is read as UTC. */
function utc(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toISOString().slice(0, 19).replace('T', ' ');
}

/** The stamped envelope every row carries; it belongs in the detail, not the summary. */
const ENVELOPE = new Set(['requestId', 'runId', 'runDepth', 'env', 'release']);

function describe(row: LogEventRow): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row.fields)) {
    if (ENVELOPE.has(key)) continue;
    if (typeof value === 'object' && value !== null) continue;
    parts.push(`${key}=${String(value)}`);
    if (parts.length === 4) break;
  }
  return parts.join(' · ') || '—';
}

export default function LogsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  return (
    <Suspense fallback={<LogsSkeleton />}>
      <LogsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LogsContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  // Either key opens this page: the console's own session, or an account the API
  // allowlist names. Holding neither is not an error to render — the reader
  // belongs on the sign-in page.
  const consoleBearer = await logsBearer();
  const bearer = consoleBearer ?? (await getAuthToken());
  if (!bearer) redirect('/logs/login');

  const filter = readFilter(await searchParams);

  const typesOrNone: Promise<LogEventTypeOption[]> = getLogEventTypes(bearer).then(
    (payload) => payload.types,
    () => [] as LogEventTypeOption[],
  );
  const pageOrError: Promise<PageOrError> = getLogEvents(bearer, filter).then(
    (page) => ({ page }),
    (err: unknown): PageOrError =>
      err instanceof ApiError
        ? { error: `${err.status}: ${err.message}`, status: err.status }
        : { error: 'The API could not be reached' },
  );
  const [types, result] = await Promise.all([typesOrNone, pageOrError]);

  if (result.status === 401) redirect('/logs/login');

  const page = result.page;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <ScrollText className="h-6 w-6 text-primary" />
            Event log
          </h1>
          <p className="mt-1 text-muted-foreground">
            One row per fact the API recorded: requests, webhooks, agent runs, tool calls,
            database outcomes and the invariants they broke.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={hrefFor(filter)}>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
          </Link>
          {consoleBearer ? (
            <SignOutForm
              action={logsSignOutAction}
              title="End this console session"
              className="flex items-center gap-2 rounded-element border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </SignOutForm>
          ) : null}
        </div>
      </div>

      <Card className="hover:shadow-card">
        <form method="get" action="/logs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="font-medium text-muted-foreground">Type</span>
            <select
              name="type"
              defaultValue={filter.type ?? ''}
              className="mt-1 flex h-10 w-full rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All types</option>
              {types.map((option) => (
                <option key={option.evt} value={option.evt}>
                  {option.label} ({option.evt})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-muted-foreground">From (UTC)</span>
            <input
              type="datetime-local"
              name="start"
              step="1"
              defaultValue={filter.start ?? ''}
              className="mt-1 flex h-10 w-full rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-muted-foreground">To (UTC)</span>
            <input
              type="datetime-local"
              name="end"
              step="1"
              defaultValue={filter.end ?? ''}
              className="mt-1 flex h-10 w-full rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-muted-foreground">Page size</span>
            <select
              name="limit"
              defaultValue={String(filter.limit ?? 50)}
              className="mt-1 flex h-10 w-full rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {LIMITS.map((limit) => (
                <option key={limit} value={String(limit)}>
                  {limit} events
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              <Search className="mr-2 h-4 w-4" />
              Apply
            </Button>
            {HOURS.map((hours) => (
              <Link
                key={hours}
                className="rounded-element border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                href={hrefFor({ type: filter.type, limit: filter.limit, start: lastHours(hours) })}
              >
                last {hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`}
              </Link>
            ))}
            <Link
              className="rounded-element px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              href="/logs"
            >
              reset
            </Link>
          </div>
        </form>
      </Card>

      {result.error && (
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The query did not answer
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Reading logs needs a key that the API accepts — the console password from{' '}
            <code>/logs/login</code>, or an account named in <code>LOG_QUERY_USER_IDS</code> — and a
            store to read: with <code>AXIOM_ENABLED=0</code> only the events this server process is
            holding are queryable.
          </p>
        </Card>
      )}

      {page && (
        <Card className="px-0 py-0 hover:shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-6 py-3 text-xs text-muted-foreground">
            <span>
              {page.events.length} event{page.events.length === 1 ? '' : 's'} · newest first ·
              page size {page.limit}
            </span>
            <span>
              {utc(page.window.startTime)} → {utc(page.window.endTime)} UTC · store:{' '}
              <strong className="font-semibold text-foreground">{page.source}</strong>
              {page.source === 'memory' && ' (this process only, not history)'}
            </span>
          </div>

          {page.events.length === 0 ? (
            <p className="px-6 py-10 text-center text-muted-foreground">
              Nothing was recorded in this window. Widen the range, or check that the events you
              expect have a type the logger is allowed to emit.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {page.events.map((row, index) => (
                <EventRow key={`${row.time}-${row.evt}-${index}`} row={row} />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-6 py-3">
            {page.nextCursor ? (
              <Link href={hrefFor({ ...filter, cursor: page.nextCursor })}>
                <Button variant="outline" size="sm">
                  Older events
                </Button>
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">no older page in this window</span>
            )}
            {filter.cursor ? (
              <Link href={hrefFor({ ...filter, cursor: undefined })}>
                <Button variant="outline" size="sm">
                  Back to newest
                </Button>
              </Link>
            ) : (
              <span />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function EventRow({ row }: { row: LogEventRow }) {
  const alarming = row.evt === 'error' || row.evt === 'anomaly' || row.evt === 'not_found';
  const correlation = Object.entries(row.fields)
    .filter(([key]) => key === 'requestId' || key === 'runId')
    .map(([key, value]) => `${key}=${String(value).slice(0, 8)}`);

  return (
    <li
      className={`px-6 py-3 ${alarming ? 'border-l-2 border-l-destructive bg-destructive/5' : ''}`}
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-xs text-muted-foreground">{utc(row.time)}</span>
          <span className="rounded-full border border-border/40 bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
            {row.evt}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{describe(row)}</span>
          {correlation.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {correlation.join(' ')}
            </span>
          )}
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-element border border-border/40 bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {JSON.stringify({ time: row.time, evt: row.evt, ...row.fields }, null, 2)}
        </pre>
      </details>
    </li>
  );
}

/** The shortcut ranges are anchored on now, so the newest page is what they show. */
function lastHours(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString().slice(0, 16);
}

function LogsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-element bg-muted" />
      <div className="h-32 animate-pulse rounded-card bg-muted" />
      <div className="h-96 animate-pulse rounded-card bg-muted" />
    </div>
  );
}
