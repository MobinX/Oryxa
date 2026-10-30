import Link from 'next/link';
import { Suspense } from 'react';
import {
  AlertTriangle,
  Bot,
  Cpu,
  Receipt,
  Store,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { cachedAdminTokenUsage } from '@/app/_cache/queries';
import { adminRead } from '@/lib/admin-read';
import { monthLabel, readMonth } from '@/lib/admin-month';
import { AdminMonthPills } from '@/components/admin-month-pills';
import { AdminPageHeader } from '@/components/admin-page-header';
import { compact, tokenMoney, whole } from '@/lib/format';
import type { AdminTokenUsage } from '@/lib/api';

export const instant = false;

export const metadata = {
  title: 'Admin — token usage',
  description: 'What the agent cost each business, month by month.',
};

type RawParams = Record<string, string | string[] | undefined>;

export default function AdminTokenAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  return (
    <Suspense fallback={<UsageSkeleton />}>
      <UsageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function UsageContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const bearer = await requireConsoleBearer();

  const month = readMonth((await searchParams).month);
  const read = await adminRead(() => cachedAdminTokenUsage(bearer, month));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Cpu}
        title="Token usage"
        description="What the agent cost, store by store. Merchants see their own chats and sales; the model bill is ours."
        actions={<AdminMonthPills hrefBase="/admin/token-analytics" month={month} />}
      />

      {read.value ? (
        <UsageTable usage={read.value} month={month} />
      ) : (
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The usage did not load
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {read.error ?? 'The console did not answer for this month.'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page reads <code>/api2/admin/token-analytics/businesses</code>, which needs the
            same key as the event log: the console session from <code>/admin/login</code>, or an
            account named in <code>LOG_QUERY_USER_IDS</code>.
          </p>
        </Card>
      )}
    </div>
  );
}

function UsageTable({ usage, month }: { usage: AdminTokenUsage; month: string }) {
  const { platform } = usage;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Stores using the agent"
          icon={Store}
          value={whole(platform.businesses)}
          sub={monthLabel(month)}
        />
        <Kpi
          label="Agent runs"
          icon={Bot}
          value={whole(platform.runCount)}
          sub={`${whole(platform.avgTokensPerRun)} tokens per run`}
        />
        <Kpi
          label="Total tokens"
          icon={Cpu}
          value={compact(platform.totalTokens)}
          sub={`${compact(platform.inputTokens)} in · ${compact(platform.outputTokens)} out`}
        />
        <Kpi
          label="Cache hits"
          icon={Zap}
          value={`${platform.cacheHitPercent.toFixed(1)}%`}
          sub={`${compact(platform.cacheHitTokens)} of input read from cache`}
        />
        <Kpi
          label="Estimated cost"
          icon={Receipt}
          value={tokenMoney(platform.estimatedCostUsd)}
          sub="from the hourly rollup, so a floor"
        />
      </section>

      <Card className="px-0 py-0 hover:shadow-card">
        <div className="border-b border-border/40 px-5 py-3">
          <h2 className="text-base font-semibold">Every store that spent tokens</h2>
          <p className="text-xs text-muted-foreground">
            Ranked by tokens, {monthLabel(month)}. A store with no usage this month is absent —
            it either never ran the agent or has been deleted.
          </p>
        </div>

        {usage.businesses.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted-foreground">
            Nothing was spent in {monthLabel(month)}.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-b-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border/40 bg-card text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Business</th>
                  <th className="px-3 py-2.5 text-right font-medium">Runs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2.5 text-right font-medium">In / Out</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cache hit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg / run</th>
                  <th className="px-5 py-2.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {usage.businesses.map((row) => (
                  <tr key={row.businessId} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/token-analytics/${row.businessId}?month=${month}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.slug ?? 'no store published'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{whole(row.runCount)}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {whole(row.totalTokens)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {whole(row.inputTokens)} / {whole(row.outputTokens)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.cacheHitPercent.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {whole(Math.round(row.avgTokensPerRun))}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {tokenMoney(row.estimatedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Read from <code>hourly_token_analytics</code>, which the agent writes after every run.
        Deleted stores keep their rows but leave this list, so this month can sum to less than the{' '}
        <code>/admin</code> tile, which counts every row ever written. The window is a calendar
        month in UTC, and the numbers can lag a live run by a few minutes because nothing expires
        this cache — the rollup moves outside this app.
      </p>
    </>
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

function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-element bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-element bg-muted" />
    </div>
  );
}
