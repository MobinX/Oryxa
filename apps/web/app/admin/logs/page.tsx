import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { AlertTriangle, LogOut, RefreshCw, ScrollText, Search } from 'lucide-react';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';
import {
  TZ_COOKIE,
  clockInZone,
  offsetLabel,
  validZone,
  zoneBoundToUtc,
  zoneWallClock,
} from '@/lib/logs-time';
import { logsSignOutAction } from '@/app/actions/logs-auth';
import { TzProbe } from '@/components/tz-probe';
import { EventRow } from '@/components/log-event-row';
import {
  ApiError,
  getLogEvents,
  getLogEventTypes,
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

export const metadata = {
  title: 'Event log — admin',
  description: 'Every request, webhook, agent run and error the Oryxa API recorded.',
};

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

/**
 * The URL and the form speak the reader's wall clock; the route speaks UTC. Only
 * this call is translated — a filter keeps what the browser sent, so the links
 * this page builds round-trip through the same clock the inputs show.
 */
function queryFilterFor(filter: LogFilter, zone: string): LogFilter {
  return {
    ...filter,
    ...(filter.start ? { start: zoneBoundToUtc(filter.start, zone) } : {}),
    ...(filter.end ? { end: zoneBoundToUtc(filter.end, zone) } : {}),
  };
}

function hrefFor(filter: LogFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return `/admin/logs${query ? `?${query}` : ''}`;
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
  if (!bearer) redirect('/admin/login');

  // The first visit renders on UTC because the server has no other clue; the probe
  // below writes what the browser's clock says and refreshes, and every read after
  // that is on the reader's own clock.
  const zone = validZone((await cookies()).get(TZ_COOKIE)?.value);

  const filter = readFilter(await searchParams);

  const typesOrNone: Promise<LogEventTypeOption[]> = getLogEventTypes(bearer).then(
    (payload) => payload.types,
    () => [] as LogEventTypeOption[],
  );
  const pageOrError: Promise<PageOrError> = getLogEvents(bearer, queryFilterFor(filter, zone)).then(
    (page) => ({ page }),
    (err: unknown): PageOrError =>
      err instanceof ApiError
        ? { error: `${err.status}: ${err.message}`, status: err.status }
        : { error: 'The API could not be reached' },
  );
  const [types, result] = await Promise.all([typesOrNone, pageOrError]);

  if (result.status === 401) redirect('/admin/login');

  const page = result.page;
  const clock = offsetLabel(zone);

  return (
    <div className="space-y-6">
      <TzProbe expected={zone} />
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
        <form method="get" action="/admin/logs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <span className="font-medium text-muted-foreground">From ({clock})</span>
            <input
              type="datetime-local"
              name="start"
              step="1"
              defaultValue={filter.start ?? ''}
              className="mt-1 flex h-10 w-full rounded-element border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-muted-foreground">To ({clock})</span>
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
                href={hrefFor({
                  type: filter.type,
                  limit: filter.limit,
                  start: lastHours(hours, zone),
                })}
              >
                last {hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`}
              </Link>
            ))}
            <Link
              className="rounded-element px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              href="/admin/logs"
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
            <code>/admin/login</code>, or an account named in <code>LOG_QUERY_USER_IDS</code> — and a
            store to read: with <code>AXIOM_ENABLED=0</code> only the events this server process is
            holding are queryable.
          </p>
        </Card>
      )}

      {page && (
        <Card className="px-0 py-0 hover:shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-6 py-3 text-xs text-muted-foreground">
            <span>
              {page.events.length} event{page.events.length === 1 ? '' : 's'} · newest first · page
              size {page.limit} · open a row for its fields
            </span>
            <span>
              {clockInZone(page.window.startTime, zone)} →{' '}
              {clockInZone(page.window.endTime, zone)} · {zone} · store:{' '}
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
                <EventRow key={`${row.time}-${row.evt}-${index}`} row={row} zone={zone} />
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

/** The shortcut ranges are anchored on now, so the newest page is what they show. */
function lastHours(hours: number, zone: string): string {
  return zoneWallClock(new Date(Date.now() - hours * 3_600_000).toISOString(), zone);
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
