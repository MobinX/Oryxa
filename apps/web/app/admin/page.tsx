import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import {
  AlertTriangle,
  Bot,
  CircleDollarSign,
  Cpu,
  Eye,
  Globe,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Package,
  Radio,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';
import { TZ_COOKIE, clockInZone, validZone } from '@/lib/logs-time';
import { logsSignOutAction } from '@/app/actions/logs-auth';
import { TzProbe } from '@/components/tz-probe';
import { EventRow } from '@/components/log-event-row';
import { AdminSkeleton } from '@/components/admin-skeleton';
import { AdminDailyChart } from '@/components/admin-daily-chart';
import {
  ApiError,
  getAdminStats,
  getLogEvents,
  type AdminStats,
  type LogQueryResult,
} from '@/lib/api';
import { compact, deltaOf, money, whole, type Delta } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SignOutForm } from '@/components/sign-out-button';

const RANGES = [7, 30, 90];
const DEFAULT_DAYS = 30;

type StatsOrError = { stats?: AdminStats; error?: string; status?: number };

type RawParams = Record<string, string | string[] | undefined>;

export const metadata = {
  title: 'Admin — platform',
  description: 'Platform-wide analytics for the Oryxa operator console.',
};

/** The links offer three ranges; anything the route can answer is accepted, so a pasted `?days=14` still works. */
function readDays(value: string | string[] | undefined): number {
  const days = Number.parseInt(Array.isArray(value) ? value[0] ?? '' : value ?? '', 10);
  return Number.isInteger(days) && days > 0 && days <= 365 ? days : DEFAULT_DAYS;
}

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const consoleBearer = await logsBearer();
  const bearer = consoleBearer ?? (await getAuthToken());
  if (!bearer) redirect('/admin/login');

  const zone = validZone((await cookies()).get(TZ_COOKIE)?.value);
  const days = readDays((await searchParams).days);

  // The events strip is decoration on top of the numbers: if the log store is slow
  // or empty, the dashboard still answers every question Postgres can.
  const statsOrError: Promise<StatsOrError> = getAdminStats(bearer, { days, tz: zone }).then(
    (stats) => ({ stats }),
    (err: unknown): StatsOrError =>
      err instanceof ApiError
        ? { error: `${err.status}: ${err.message}`, status: err.status }
        : { error: 'The API could not be reached' },
  );
  const recentOrNone: Promise<LogQueryResult | undefined> = getLogEvents(bearer, { limit: 8 }).then(
    (page) => page,
    () => undefined,
  );
  const [result, recent] = await Promise.all([statsOrError, recentOrNone]);

  if (result.status === 401) redirect('/admin/login');

  const stats = result.stats;

  return (
    <div className="space-y-6">
      <TzProbe expected={zone} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            Platform
          </h1>
          <p className="mt-1 text-muted-foreground">
            Every business on one clock: who is here, what the agent is doing and what it costs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-border/40 bg-muted/40 p-1">
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`/admin?days=${range}`}
                aria-current={days === range ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                  days === range
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}d
              </Link>
            ))}
          </div>
          <Link href={`/admin?days=${days}`}>
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

      {result.error && (
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The numbers did not load
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page reads <code>/api2/admin/stats</code>, which needs the same key as the event
            log: the console password from <code>/admin/login</code>, or an account named in{' '}
            <code>LOG_QUERY_USER_IDS</code>. The <code>visits</code> table must exist too — a
            deployment that has not applied migration 0011 answers this route with a 500.
          </p>
        </Card>
      )}

      {stats ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Kpi
              label="Conversations"
              icon={MessagesSquare}
              value={whole(stats.window.conversations)}
              delta={deltaOf(stats.window.conversations, stats.previous.conversations)}
            />
            <Kpi
              label="Messages"
              icon={MessageCircle}
              value={whole(stats.window.messages)}
              sub={`${whole(stats.window.inboundMessages)} in · ${whole(stats.window.outboundMessages)} out`}
              delta={deltaOf(stats.window.messages, stats.previous.messages)}
            />
            <Kpi
              label="Orders"
              icon={ShoppingBag}
              value={whole(stats.window.orders)}
              delta={deltaOf(stats.window.orders, stats.previous.orders)}
            />
            <Kpi
              label="Revenue"
              icon={CircleDollarSign}
              value={money(stats.window.revenue)}
              delta={deltaOf(stats.window.revenue, stats.previous.revenue)}
            />
            <Kpi
              label="Storefront visits"
              icon={Eye}
              value={whole(stats.window.visits)}
              sub={
                stats.window.visits === 0
                  ? 'tracking starts with this deploy'
                  : 'one per person, per store, per day'
              }
              delta={deltaOf(stats.window.visits, stats.previous.visits)}
            />
            <Kpi
              label="Agent runs"
              icon={Bot}
              value={whole(stats.window.agentRuns)}
              delta={deltaOf(stats.window.agentRuns, stats.previous.agentRuns)}
            />
            <Kpi
              label="LLM tokens"
              icon={Cpu}
              value={compact(stats.window.llmTokens)}
              delta={deltaOf(stats.window.llmTokens, stats.previous.llmTokens)}
              neutral
            />
            <Kpi
              label="Estimated cost"
              icon={Receipt}
              value={money(stats.window.estimatedCostUsd)}
              sub="from the hourly rollup, so a floor"
              delta={deltaOf(stats.window.estimatedCostUsd, stats.previous.estimatedCostUsd)}
              neutral
            />
          </section>

          <Card className="hover:shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Every account, all time
              </h2>
              <Link
                href="/admin/logs"
                className="text-xs font-medium text-primary hover:underline"
              >
                Event log →
              </Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Snapshot label="Users" icon={Users} value={whole(stats.snapshot.users)} />
              <Snapshot label="Businesses" icon={Store} value={whole(stats.snapshot.businesses)} />
              <Snapshot
                label="Published stores"
                icon={Globe}
                value={whole(stats.snapshot.publishedStores)}
              />
              <Snapshot label="Channels" icon={Radio} value={whole(stats.snapshot.channels)} />
              <Snapshot label="Products" icon={Package} value={whole(stats.snapshot.products)} />
            </div>
          </Card>

          <Card className="hover:shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Per day, on your clock</h2>
              <p className="text-xs text-muted-foreground">
                {days} days · {zone}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A day is yours, not the server's: {clockInZone(stats.range.startTime, zone)} starts
              the window.
            </p>
            <div className="mt-4">
              <AdminDailyChart
                daily={stats.daily}
                hint="Visit tracking starts with this deploy, so an empty visits series is expected on the first days. Messages, conversations and orders reach back as far as the data does."
              />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="px-0 py-0 lg:col-span-2 hover:shadow-card">
              <div className="border-b border-border/40 px-6 py-3">
                <h2 className="text-base font-bold">Busiest businesses</h2>
                <p className="text-xs text-muted-foreground">
                  Ranked by messages in the last {days} days.
                </p>
              </div>
              {stats.topBusinesses.length === 0 ? (
                <p className="px-6 py-10 text-center text-muted-foreground">
                  No business had a message, an order or a visit in this window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-6 py-2.5 font-medium">Business</th>
                        <th className="px-3 py-2.5 text-right font-medium">Chats</th>
                        <th className="px-3 py-2.5 text-right font-medium">Messages</th>
                        <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                        <th className="px-6 py-2.5 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {stats.topBusinesses.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-6 py-3">
                            <Link
                              href={`/b/${row.id}/analytics`}
                              className="font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {row.name}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.slug ?? 'no store published'}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {whole(row.conversations)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{whole(row.messages)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{whole(row.orders)}</td>
                          <td className="px-6 py-3 text-right font-medium tabular-nums">
                            {money(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="px-0 py-0 hover:shadow-card">
              <div className="border-b border-border/40 px-6 py-3">
                <h2 className="text-base font-bold">Health</h2>
                <p className="text-xs text-muted-foreground">
                  Counted from the log store, not from Postgres.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/40">
                <Anomaly
                  label="Errors"
                  count={stats.anomalies?.errors}
                  cap={stats.anomalies?.cap}
                  unavailable={!stats.anomalies}
                  href="/admin/logs?type=error"
                  tone="text-destructive"
                />
                <Anomaly
                  label="Auth rejections"
                  count={stats.anomalies?.authRejections}
                  cap={stats.anomalies?.cap}
                  unavailable={!stats.anomalies}
                  href="/admin/logs?type=auth"
                  tone="text-amber-600 dark:text-amber-400"
                />
              </div>
              <div className="border-t border-border/40 px-6 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Latest events
                </h3>
              </div>
              {recent && recent.events.length > 0 ? (
                <ul className="divide-y divide-border/40">
                  {recent.events.map((row, index) => (
                    <EventRow
                      key={`${row.time}-${row.evt}-${index}`}
                      row={row}
                      zone={zone}
                      compact
                    />
                  ))}
                </ul>
              ) : (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {recent
                    ? 'Nothing in the log store yet — the API has recorded no events since it started, or Axiom ingest is off.'
                    : 'The log store did not answer. The numbers above are unaffected.'}
                </p>
              )}
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Window {clockInZone(stats.range.startTime, zone)} → {clockInZone(stats.range.endTime, zone)}{' '}
            · {zone}. Comparisons are against the {days} days before that. Tokens and cost come from{' '}
            <code>hourly_token_analytics</code>; visits count a person once per store per day.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  delta,
  neutral = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  delta?: Delta | null;
  /** Cost and tokens rising is not a win, so their chip keeps the colour of a note rather than a praise. */
  neutral?: boolean;
}) {
  const tone = !delta
    ? ''
    : neutral || delta.tone === 'flat'
      ? 'border-border/40 bg-muted text-muted-foreground'
      : delta.tone === 'up'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';

  return (
    <Card className="hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-element bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-2">
        {delta ? (
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
          >
            {delta.text}
          </span>
        ) : null}
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </Card>
  );
}

function Snapshot({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-element bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Anomaly({
  label,
  count,
  cap,
  unavailable,
  href,
  tone,
}: {
  label: string;
  count?: number;
  cap?: number;
  unavailable: boolean;
  href: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card px-6 py-4 transition-colors hover:bg-muted/40"
      title={`Open the event log filtered to ${label.toLowerCase()}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {unavailable ? (
        <p className="mt-1 text-sm text-muted-foreground">log store unavailable</p>
      ) : (
        <p className={`mt-1 text-2xl font-bold tabular-nums ${count ? tone : 'text-foreground'}`}>
          {/* A count that reached the cap is a floor, and saying so beats implying precision. */}
          {cap !== undefined && count !== undefined && count >= cap ? `${cap}+` : whole(count ?? 0)}
        </p>
      )}
    </Link>
  );
}
