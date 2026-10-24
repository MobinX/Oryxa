import Link from 'next/link';
import { Suspense } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Cpu,
  Gauge,
  Receipt,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { cachedAdminTokenUsageDetail } from '@/app/_cache/queries';
import { adminRead, type Read } from '@/lib/admin-read';
import { monthLabel, readMonth } from '@/lib/admin-month';
import { AdminMonthPills } from '@/components/admin-month-pills';
import { AdminPageHeader } from '@/components/admin-page-header';
import { compact, tokenMoney, whole } from '@/lib/format';
import type { AdminTokenUsageDetail } from '@/lib/api';

export const instant = false;

export const metadata = {
  title: 'Admin — token usage by store',
  description: "What one business's agent runs cost this month.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What each `integration_type` in the rollup means, in the words the rest of the console uses. */
const INTEGRATION_LABELS: Record<string, string> = {
  facebook_messenger: 'Messenger reply',
  facebook_comment: 'Comment reply',
  instagram_messenger: 'Instagram DM',
  instagram_comment: 'Instagram comment',
  ai_post_generation: 'AI post generation',
  ai_post_tuning: 'AI post tuning',
};

type RawParams = Record<string, string | string[] | undefined>;

export default function AdminBusinessTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<RawParams>;
}) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<RawParams>;
}) {
  const bearer = await requireConsoleBearer();

  const { businessId } = await params;
  const month = readMonth((await searchParams).month);

  // The route would answer a junk id with a 400; refusing it here keeps the difference
  // between "that is not a store" and "the API is down" honest.
  const read: Read<AdminTokenUsageDetail> = UUID.test(businessId)
    ? await adminRead(() => cachedAdminTokenUsageDetail(bearer, businessId, month))
    : { missing: true };

  const back = `/admin/token-analytics?month=${month}`;

  if (read.missing) {
    return (
      <div className="space-y-6">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All businesses
        </Link>
        <Card className="hover:shadow-card">
          <p className="font-semibold">No live store with that id</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It was deleted, or the address was typed. Usage rows are kept for a deleted store, but
            the console lists only businesses that still exist.
          </p>
        </Card>
      </div>
    );
  }

  if (read.error || !read.value) {
    return (
      <div className="space-y-6">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All businesses
        </Link>
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The usage did not load
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{read.error ?? 'The console did not answer.'}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page reads <code>/api2/admin/token-analytics/businesses/:businessId</code>, which
            needs the console session from <code>/admin/login</code>, or an account named in{' '}
            <code>LOG_QUERY_USER_IDS</code>.
          </p>
        </Card>
      </div>
    );
  }

  const usage = read.value;
  const { totals } = usage;
  const maxDay = Math.max(...usage.daily.map((day) => day.totalTokens), 1);

  return (
    <div className="space-y-6">
      <Link
        href={back}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All businesses
      </Link>

      <AdminPageHeader
        icon={Cpu}
        title={usage.business.name}
        description={`${usage.business.slug ?? 'no store published'} · ${monthLabel(month)} · ${whole(totals.runCount)} agent runs`}
        actions={<AdminMonthPills hrefBase={`/admin/token-analytics/${businessId}`} month={month} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total tokens"
          icon={Cpu}
          value={whole(totals.totalTokens)}
          sub={`${compact(totals.inputTokens)} in · ${compact(totals.outputTokens)} out`}
        />
        <Kpi
          label="Cache hit"
          icon={Zap}
          value={`${totals.cacheHitPercent.toFixed(1)}%`}
          sub={`${whole(totals.cacheHitTokens)} cached of ${whole(totals.inputTokens)} input`}
        />
        <Kpi
          label="Cache miss"
          icon={AlertTriangle}
          value={whole(totals.cacheMissTokens)}
          sub="input tokens re-read in full"
        />
        <Kpi
          label="Avg tokens / run"
          icon={Bot}
          value={whole(Math.round(totals.avgTokensPerRun))}
          sub={`${whole(totals.runCount)} runs this month`}
        />
        <Kpi
          label="Input tokens"
          icon={Gauge}
          value={whole(totals.inputTokens)}
          sub="prompt, tools and history sent"
        />
        <Kpi
          label="Output tokens"
          icon={Gauge}
          value={whole(totals.outputTokens)}
          sub="what the model wrote back"
        />
        <Kpi
          label="Avg latency"
          icon={Timer}
          value={`${whole(totals.avgLatencyMs)} ms`}
          sub="weighted by runs, not by day"
        />
        <Kpi
          label="Estimated cost"
          icon={Receipt}
          value={tokenMoney(totals.estimatedCostUsd)}
          sub="from the hourly rollup, so a floor"
        />
      </section>

      <Card className="px-0 py-0 hover:shadow-card">
        <div className="border-b border-border/40 px-6 py-3">
          <h2 className="text-base font-semibold">Which pipeline spent it</h2>
          <p className="text-xs text-muted-foreground">
            One row per integration type in <code>hourly_token_analytics</code>.
          </p>
        </div>
        {usage.byIntegration.length === 0 ? (
          <p className="px-6 py-10 text-center text-muted-foreground">
            Nothing ran for this store in {monthLabel(month)}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-2.5 font-medium">Integration</th>
                  <th className="px-3 py-2.5 text-right font-medium">Runs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2.5 text-right font-medium">In / Out</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg / run</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cache hit</th>
                  <th className="px-6 py-2.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {usage.byIntegration.map((row) => (
                  <tr key={row.integrationType} className="transition-colors hover:bg-muted/40">
                    <td className="px-6 py-3 font-medium">
                      {INTEGRATION_LABELS[row.integrationType] ?? row.integrationType}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{whole(row.runCount)}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {whole(row.totalTokens)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {whole(row.inputTokens)} / {whole(row.outputTokens)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {whole(Math.round(row.avgTokensPerRun))}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.cacheHitPercent.toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">
                      {tokenMoney(row.estimatedCostUsd)}
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
          <h2 className="text-base font-semibold">Day by day</h2>
          <p className="text-xs text-muted-foreground">
            UTC days, because the rollup buckets in UTC hours. Only the days that ran appear.
          </p>
        </div>
        {usage.daily.length === 0 ? (
          <p className="px-6 py-10 text-center text-muted-foreground">No usage to break down.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {usage.daily.map((day) => (
              <li key={day.date} className="flex items-center gap-4 px-6 py-2.5">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {day.date}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(1, (day.totalTokens / maxDay) * 100)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                  {whole(day.totalTokens)}
                </span>
                <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                  {whole(day.runCount)} runs
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {tokenMoney(day.estimatedCostUsd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Window {usage.startTime.slice(0, 10)} → {usage.endTime.slice(0, 10)} UTC. The numbers can
        lag a live run by a few minutes: the rollup is written by the agent, outside this app, so
        nothing expires this cache.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}) {
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
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-element bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-element bg-muted" />
    </div>
  );
}
