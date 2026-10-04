import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { AlertTriangle, Info, LogOut, RefreshCw, ScrollText, Search } from 'lucide-react';
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

/** The stamped envelope every row carries; it belongs in the detail, not the summary. */
const ENVELOPE = new Set(['requestId', 'runId', 'runDepth', 'env', 'release', 'message']);

/** Only for rows logged before the message field existed — then a few facts beat nothing. */
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

type Lane = { chip: string; dot: string; text: string; row?: string };

/**
 * One colour family per speaker, so a wall of rows separates by eye: the lanes
 * that describe ordinary traffic stay cool, the ones that describe a decision
 * turn violet, and the ones that mean something went wrong are the only rows
 * allowed to be red. Tailwind needs every class name written out, so each
 * family is spelled in full rather than built from the colour name.
 */
const FAMILIES: Record<string, { chip: string; dot: string; text: string }> = {
  sky: { chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', text: 'text-sky-800 dark:text-sky-200' },
  cyan: { chip: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500', text: 'text-cyan-800 dark:text-cyan-200' },
  blue: { chip: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', text: 'text-blue-800 dark:text-blue-200' },
  indigo: { chip: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', text: 'text-indigo-800 dark:text-indigo-200' },
  slate: { chip: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-300' },
  stone: { chip: 'border-stone-500/40 bg-stone-500/10 text-stone-700 dark:text-stone-300', dot: 'bg-stone-500', text: 'text-stone-700 dark:text-stone-300' },
  violet: { chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', text: 'text-violet-800 dark:text-violet-200' },
  purple: { chip: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300', dot: 'bg-purple-500', text: 'text-purple-800 dark:text-purple-200' },
  fuchsia: { chip: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', text: 'text-fuchsia-800 dark:text-fuchsia-200' },
  teal: { chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', text: 'text-teal-800 dark:text-teal-200' },
  yellow: { chip: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500', text: 'text-yellow-800 dark:text-yellow-200' },
  amber: { chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-200' },
  orange: { chip: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', text: 'text-orange-800 dark:text-orange-200' },
  red: { chip: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300', dot: 'bg-red-500', text: 'text-red-800 dark:text-red-200' },
  rose: { chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', text: 'text-rose-800 dark:text-rose-200' },
};

const LANES: Record<string, Lane> = {
  req: FAMILIES.sky,
  http_out: FAMILIES.cyan,
  webhook: FAMILIES.blue,
  webhook_item: FAMILIES.indigo,
  db: FAMILIES.slate,
  db_summary: FAMILIES.stone,
  agent_input: FAMILIES.violet,
  agent_run: FAMILIES.purple,
  tool_call: FAMILIES.fuchsia,
  tool_result: FAMILIES.teal,
  bg: FAMILIES.yellow,
  auth: { ...FAMILIES.amber, row: 'border-l-2 border-l-amber-500/60 bg-amber-500/5' },
  not_found: { ...FAMILIES.orange, row: 'border-l-2 border-l-orange-500/60 bg-orange-500/5' },
  error: { ...FAMILIES.red, row: 'border-l-2 border-l-destructive bg-destructive/5' },
  anomaly: { ...FAMILIES.rose, row: 'border-l-2 border-l-destructive bg-destructive/5' },
};

const PLAIN_LANE: Lane = {
  chip: 'border-border/40 bg-muted text-muted-foreground',
  dot: 'bg-muted-foreground',
  text: 'text-foreground',
};

/**
 * `[webhook] the sentence the logger wrote`. The tag becomes the coloured chip,
 * so the row itself says only what happened.
 */
function lineOf(row: LogEventRow): { tag: string; text: string } {
  const raw = typeof row.fields.message === 'string' ? row.fields.message.trim() : '';
  const tagged = /^\[([a-z_]+)\]\s*(.*)$/s.exec(raw);
  if (tagged) return { tag: tagged[1], text: tagged[2] || '—' };
  return { tag: row.evt.replace(/_/g, ' '), text: raw || describe(row) };
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

function EventRow({ row, zone }: { row: LogEventRow; zone: string }) {
  const lane = LANES[row.evt] ?? PLAIN_LANE;
  const { tag, text } = lineOf(row);

  return (
    <li className={`px-6 py-2.5 ${lane.row ?? ''}`}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-x-3">
          <span className="shrink-0 pt-1 font-mono text-xs text-muted-foreground">
            {clockInZone(row.time, zone)}
          </span>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${lane.chip}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${lane.dot}`} />
            {tag}
          </span>
          <span className={`line-clamp-2 min-w-0 flex-1 text-sm ${lane.text}`}>{text}</span>
          <span className="shrink-0 pt-0.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground group-open:text-foreground">
            <Info className="h-4 w-4" aria-hidden />
            <span className="sr-only">Show the fields behind this line</span>
          </span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-element border border-border/40 bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {JSON.stringify({ time: row.time, evt: row.evt, ...row.fields }, null, 2)}
        </pre>
      </details>
    </li>
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
