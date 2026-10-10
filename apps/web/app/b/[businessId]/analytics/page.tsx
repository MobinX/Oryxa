import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedAnalytics, cachedBilling, cachedMe, cachedNotifications } from '@/app/_cache/queries';
import AnalyticsSkeleton from './skeleton';
import { Card } from '@/components/ui/card';
import {
  ArrowUpRight,
  ShoppingBag,
  MessageSquare,
  MessagesSquare,
  Bell,
  Layers,
  Clock,
  CircleDollarSign,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SearchBar } from '@/components/search-bar';
import { money, whole, deltaOf, type Delta } from '@/lib/format';

const PERIODS = [7, 30, 90];

/** The pills offer three windows; anything inside the API's own bound is accepted, so a pasted `?days=14` still works. */
function readDays(value: string | undefined): number {
  const days = Number.parseInt(value ?? '', 10);
  return Number.isInteger(days) && days > 0 ? Math.min(days, 365) : 30;
}

export default function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { businessId } = await params;
  const days = readDays((await searchParams).days);
  const token = await requireAuth();

  const [analytics, me, quota, notices] = await Promise.all([
    cachedAnalytics(token, businessId, days),
    cachedMe(token),
    cachedBilling(token, businessId).then((overview) => overview.quota, () => null),
    cachedNotifications(token, businessId),
  ]);

  const stats = analytics.totals;
  const compared = analytics.comparison ?? {};
  const userInitial = me.name.trim().charAt(0).toUpperCase() || 'U';

  // Every number below is what the agent and the checkout did inside this window. The
  // platform's own cost — tokens, cache reads, model spend — is deliberately not here:
  // it is Oryxa's bill to read, and the operator console is where it lives.
  // Keyed by date rather than by position: both series come back covering the same days, but
  // matching them on an index would silently pair Tuesday's orders with Monday's messages the
  // day the API changes how it fills a gap.
  const ordersByDate = new Map<string, number>(
    (analytics.dailyOrders ?? []).map((day: any) => [day.date as string, day.count as number]),
  );
  const series: Array<{ date: string; messages: number; orders: number }> = (
    analytics.dailyMessages ?? []
  ).map((day: any) => ({
    date: day.date as string,
    messages: day.count as number,
    orders: ordersByDate.get(day.date) ?? 0,
  }));
  const maxDaily = Math.max(...series.map((day) => Math.max(day.messages, day.orders)), 1);

  const revenueTrend = (analytics.dailyOrders ?? []).reduce(
    (total: number, day: any) => total + (day.revenue ?? 0),
    0,
  );

  const orderStates: Array<{ state: string; count: number; revenue: number }> =
    analytics.ordersByState ?? [];

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        <SearchBar businessId={businessId} />

        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />

          <Link
            href={`/b/${businessId}/notifications`}
            aria-label={`Notifications${notices.unreadCount > 0 ? ` (${notices.unreadCount} unread)` : ''}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card hover:bg-muted transition-colors"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {notices.unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-primary" />
            )}
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20">
            {userInitial}
          </div>
        </div>
      </div>

      {/* Title & period selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chats answered, orders taken and what they brought in — over the last {days} days,
            against the {days} days before that.
          </p>
        </div>

        <div className="flex items-center rounded-xl border border-border/60 bg-muted/40 p-1">
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={`/b/${businessId}/analytics?days=${period}`}
              aria-current={period === days ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === days
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {period}d
            </Link>
          ))}
        </div>
      </div>

      {/* SECTION 1: WINDOW METRICS */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Customer messages"
          icon={MessagesSquare}
          value={whole(compared.messages?.current ?? 0)}
          delta={deltaOf(compared.messages?.current ?? 0, compared.messages?.previous ?? 0)}
        />
        <Metric
          label="Conversations"
          icon={MessageSquare}
          value={whole(compared.conversations?.current ?? 0)}
          delta={deltaOf(
            compared.conversations?.current ?? 0,
            compared.conversations?.previous ?? 0,
          )}
        />
        <Metric
          label="Orders"
          icon={ShoppingBag}
          value={whole(compared.orders?.current ?? 0)}
          delta={deltaOf(compared.orders?.current ?? 0, compared.orders?.previous ?? 0)}
        />
        <Metric
          label="Revenue"
          icon={CircleDollarSign}
          value={money(compared.revenue?.current ?? 0)}
          delta={deltaOf(compared.revenue?.current ?? 0, compared.revenue?.previous ?? 0)}
        />

        {/* Replies left in the current 30-day cycle. Not a window metric: the cycle is the
            billing period, so it keeps its own clock no matter which range is selected. */}
        {quota && (
          <Card className="border-border/60 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Replies Left This Cycle
              </span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <h4
              className={`font-geist text-3xl font-extrabold tracking-tight mt-3 ${
                quota.messageBlocked
                  ? 'text-destructive'
                  : quota.messageLimit !== null && quota.messagesUsed / quota.messageLimit >= 0.8
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground'
              }`}
            >
              {quota.messageLimit === null
                ? 'Uncapped'
                : Math.max(0, quota.messageLimit - quota.messagesUsed).toLocaleString()}
            </h4>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
              <span>
                Comments:{' '}
                <strong className="text-foreground">
                  {quota.commentLimit === null
                    ? 'uncapped'
                    : Math.max(0, quota.commentLimit - quota.commentsUsed).toLocaleString()}
                </strong>
              </span>
              <span>{quota.cycle.daysLeft}d to reset</span>
            </div>
            <Link
              href={`/b/${businessId}/billing`}
              className="mt-2 block text-xs font-medium text-primary hover:underline"
            >
              {quota.assigned ? quota.planName : 'No plan — unlimited'} →
            </Link>
          </Card>
        )}
      </div>

      {/* SECTION 2: DAILY ACTIVITY & ORDER STATES */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card className="border-border/60 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-geist text-lg font-bold text-foreground">
                  Every day in the window
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customer messages and orders, one bar per day.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span>Messages</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span>Orders</span>
                </div>
              </div>
            </div>

            <div className="h-56 w-full relative">
              {series.length === 0 || series.every((day) => day.messages === 0 && day.orders === 0) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span>No customer wrote in during this window</span>
                  <span className="text-xs text-muted-foreground/70 mt-1">
                    Connect a page, and the days start filling themselves in
                  </span>
                </div>
              ) : (
                <div className="w-full h-full flex items-end gap-1.5 pt-4">
                  {series.map((day) => (
                    <div key={day.date} className="flex-1 h-full flex flex-col justify-end group relative">
                      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[11px] rounded-lg p-2.5 pointer-events-none whitespace-nowrap z-20 shadow-xl border border-slate-700">
                        <p className="font-bold">{day.date}</p>
                        <div className="mt-1 space-y-0.5 text-[10px] text-slate-300">
                          <p>Messages: <strong className="text-white">{day.messages}</strong></p>
                          <p>Orders: <strong className="text-white">{day.orders}</strong></p>
                        </div>
                      </div>

                      <div className="w-full relative flex items-end justify-center h-full rounded-t-md overflow-hidden bg-muted/20 gap-0.5">
                        <div
                          style={{ height: `${Math.max(2, (day.messages / maxDaily) * 100)}%` }}
                          className="w-full bg-primary/60 group-hover:bg-primary transition-all duration-300"
                        />
                        <div
                          style={{ height: `${Math.max(2, (day.orders / maxDaily) * 100)}%` }}
                          className="w-full bg-emerald-500/60 group-hover:bg-emerald-500 transition-all duration-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground font-semibold px-1">
              <span>{series[0]?.date ?? ''}</span>
              <span>{series[Math.floor(series.length / 2)]?.date ?? ''}</span>
              <span>{series[series.length - 1]?.date ?? ''}</span>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card className="border-border/60 p-6 h-full flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Layers className="h-5 w-5 text-primary" />
                <h4 className="font-geist text-lg font-bold text-foreground">Orders by state</h4>
              </div>

              <div className="space-y-3.5">
                {orderStates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    No order has been placed yet.
                  </p>
                ) : (
                  orderStates.map((item) => (
                    <div
                      key={item.state}
                      className="flex items-center justify-between border border-border/40 rounded-xl p-3 hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <ShoppingBag className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-bold text-foreground capitalize">{item.state}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-extrabold text-foreground">
                          {whole(item.count)}
                        </p>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {money(item.revenue)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 space-y-1 text-xs text-muted-foreground font-semibold">
              <p>
                Revenue booked in these {days} days: {money(revenueTrend)}
              </p>
              <Link
                href={`/b/${businessId}/orders`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open orders <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 3: ALL TIME */}
      <Card className="border-border/60 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h4 className="font-geist text-lg font-bold text-foreground">Since the store opened</h4>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Lifelong label="Products" value={whole(stats.products ?? 0)} />
          <Lifelong label="Channels" value={whole(stats.channels ?? 0)} />
          <Lifelong label="Conversations" value={whole(stats.conversations ?? 0)} />
          <Lifelong label="Messages" value={whole(stats.messages ?? 0)} />
          <Lifelong label="Orders" value={whole(stats.orders ?? 0)} />
          <Lifelong label="Revenue" value={money(stats.revenue ?? 0)} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Your assistant answers at an average of{' '}
          <strong className="text-foreground">
            {(stats.avgResponseTime ?? 0).toFixed(1)}s
          </strong>{' '}
          after a customer writes in — measured over the whole life of the store, not this
          window.
        </p>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  delta,
}: {
  label: string;
  value: string;
  icon: typeof MessageSquare;
  delta: Delta | null;
}) {
  const tone = !delta
    ? ''
    : delta.tone === 'flat'
      ? 'border-border/40 bg-muted text-muted-foreground'
      : delta.tone === 'up'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';

  return (
    <Card className="border-border/60 p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-foreground tabular-nums">
        {value}
      </h4>
      <div className="mt-3 flex min-h-5 items-center gap-2 border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        {delta ? (
          <span
            className={`rounded-full border px-1.5 py-0.5 font-semibold tabular-nums ${tone}`}
          >
            {delta.text}
          </span>
        ) : null}
        <span>vs the previous window</span>
      </div>
    </Card>
  );
}

function Lifelong({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
