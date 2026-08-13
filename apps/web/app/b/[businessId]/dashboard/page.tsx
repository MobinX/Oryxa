import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedAnalytics, cachedBusiness, cachedMe } from '@/app/_cache/queries';
import DashboardSkeleton from './skeleton';
import { Card } from '@/components/ui/card';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import {
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  Search,
  Bell,
  ArrowRight,
  TrendingUp,
  Activity,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  FolderTree,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SearchBar } from '@/components/search-bar';

const sparklinePaths = {
  products: 'M5 22C20 22 25 12 40 12C55 12 60 25 75 25C90 25 95 8 110 8',
  orders: 'M5 25C20 25 25 10 40 10C55 10 60 22 75 22C90 22 95 5 110 5',
  channels: 'M5 18C20 18 25 25 40 25C55 25 60 10 75 10C90 10 95 20 110 20',
  inbox: 'M5 12C20 12 25 5 40 5C55 5 60 22 75 22C90 22 95 15 110 15',
};


export default function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent params={params} />
    </Suspense>
  );
}

async function DashboardContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();

  const [business, analytics, me] = await Promise.all([
    cachedBusiness(token, businessId),
    cachedAnalytics(token, businessId, 7),
    cachedMe(token),
  ]);

  const stats = analytics.totals;
  const userInitial = me.name.trim().charAt(0).toUpperCase() || 'U';
  const totalViews = (stats.messages ?? 0) + (stats.conversations ?? 0) * 5;

  const topStats = [
    {
      label: 'Products',
      count: stats.products,
      desc: 'Total products',
      icon: Package,
      color: 'text-purple-500 bg-purple-500/10 dark:text-purple-400 dark:bg-purple-500/10',
      strokeColor: '#A855F7',
      sparkline: sparklinePaths.products,
      href: 'products',
    },
    {
      label: 'Orders',
      count: stats.orders,
      desc: 'Total orders',
      icon: ShoppingCart,
      color: 'text-rose-500 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/10',
      strokeColor: '#F43F5E',
      sparkline: sparklinePaths.orders,
      href: 'orders',
    },
    {
      label: 'Channels',
      count: stats.channels,
      desc: 'Connected channels',
      icon: Radio,
      color: 'text-emerald-500 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/10',
      strokeColor: '#10B981',
      sparkline: sparklinePaths.channels,
      href: 'channels',
    },
    {
      label: 'Inbox',
      count: stats.conversations,
      desc: 'Total conversations',
      icon: MessageSquare,
      color: 'text-blue-500 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-500/10',
      strokeColor: '#3B82F6',
      sparkline: sparklinePaths.inbox,
      href: 'inbox',
    },
  ];

  // Merge recent activity dynamically from recent orders and recent conversations
  const recentActivity = [
    ...analytics.recentOrders.map((o: any) => ({
      type: 'order',
      title: 'Order Received',
      desc: `New order from ${o.customerName} for ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(o.totalPrice)}`,
      timeLabel: formatTimeAgo(new Date(o.createdAt)),
      timestamp: new Date(o.createdAt).getTime(),
      icon: ShoppingCart,
      color: 'text-rose-600 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/10',
    })),
    ...analytics.recentConversations.map((c: any) => ({
      type: 'conversation',
      title: 'New Conversation',
      desc: `Chat started with ${c.customerName || 'customer'} (${c.id.slice(0, 8)})`,
      timeLabel: formatTimeAgo(new Date(c.createdAt)),
      timestamp: new Date(c.createdAt).getTime(),
      icon: MessageSquare,
      color: 'text-blue-600 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-500/10',
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  // Helper to format percentage changes
  const formatChange = (curr: number, prev: number) => {
    if (prev === 0) return { label: curr > 0 ? '+100%' : '0%', positive: curr >= 0 };
    const diff = ((curr - prev) / prev) * 100;
    return {
      label: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs last week`,
      positive: diff >= 0,
    };
  };

  const orderChange = formatChange(analytics.comparison.orders.current, analytics.comparison.orders.previous);
  const revenueChange = formatChange(analytics.comparison.revenue.current, analytics.comparison.revenue.previous);
  const messageChange = formatChange(analytics.comparison.messages.current, analytics.comparison.messages.previous);
  // View change assumes direct mapping to message/conversations activity
  const viewChange = formatChange(
    analytics.comparison.messages.current + analytics.comparison.conversations.current * 5,
    analytics.comparison.messages.previous + analytics.comparison.conversations.previous * 5
  );

  return (
    <div className="space-y-8">
      {/* Top Navigation / Search Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        <SearchBar businessId={businessId} />

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />

          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card hover:bg-muted transition-colors">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-primary" />
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20">
            {userInitial}
          </div>
        </div>
      </div>

      {/* Greeting Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Good morning, {me.name}! 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Here&apos;s a live overview of your business today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownSelect
            options={[
              { value: '7', label: 'Last 7 Days' },
              { value: '30', label: 'Last 30 Days' },
            ]}
            defaultValue="7"
            showCalendarIcon
          />
        </div>
      </div>

      {/* Row 1: Four Statistics Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {topStats.map((item) => (
          <Link key={item.label} href={`/b/${businessId}/${item.href}`} className="block group">
            <Card className="hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.99] border-border/60 transition-all duration-200">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                      <item.icon className="h-5 w-5 stroke-[1.75]" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {item.label}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-geist text-3xl font-extrabold tracking-tight text-foreground">
                      {item.count}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <div className="w-20 h-10 shrink-0 self-end opacity-90 group-hover:opacity-100 transition-opacity">
                  <svg className="w-full h-full" viewBox="0 0 120 30" fill="none">
                    <path
                      d={item.sparkline}
                      stroke={item.strokeColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Row 2: Recent Activity & Meta Banner */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Activity */}
        <div className="lg:col-span-5 flex">
          <Card className="w-full flex flex-col justify-between border-border/60">
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-geist text-lg font-bold text-foreground">
                  Recent activity
                </h3>
              </div>

              <div className="space-y-5">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No recent activity found.
                  </p>
                ) : (
                  recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activity.color}`}>
                        <activity.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{activity.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
                          {activity.desc}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap pt-0.5">
                        {activity.timeLabel}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Link
              href={`/b/${businessId}/inbox`}
              className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-muted/50 py-3 text-xs font-semibold text-primary hover:bg-muted transition-colors w-full"
            >
              View inbox
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>

        {/* Connect with Meta Promotion Card */}
        <div className="lg:col-span-7 flex">
          <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-800 p-8 text-white shadow-xl shadow-indigo-500/10 flex flex-col justify-between w-full min-h-[300px]">
            <div className="absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-white/5 blur-2xl" />
            <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-indigo-400/10 blur-2xl" />

            <div className="relative z-10 max-w-md">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider border border-white/10 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-indigo-200 animate-pulse" />
                Meta integration
              </div>
              <h3 className="font-geist text-2xl font-bold tracking-tight mt-4 sm:text-3xl leading-tight">
                Connect with <span className="text-indigo-200">Meta</span>
              </h3>
              <p className="text-sm text-indigo-100/90 leading-relaxed mt-3">
                Reach more customers by connecting your Facebook Page and Instagram account. Automate responses instantly.
              </p>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-8 pt-4 border-t border-white/10">
              <Link
                href={`/b/${businessId}/channels`}
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:bg-indigo-50 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                Connect Now
              </Link>

              <div className="flex items-center gap-2 self-start sm:self-auto opacity-95">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/15 backdrop-blur-sm font-bold text-sm">
                  f
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/15 backdrop-blur-sm text-xs font-semibold italic">
                  in
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/15 backdrop-blur-sm font-geist font-bold text-[10px]">
                  ∞
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Performance Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-geist text-lg font-bold text-foreground">
                Performance overview
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compare your business metrics with the previous period.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Views */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total views
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{totalViews}</h4>
                <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${viewChange.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <span>{viewChange.positive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}</span>
                  <span>{viewChange.label}</span>
                </div>
              </div>
              <div className="w-16 h-8 opacity-80">
                <svg className="w-full h-full" viewBox="0 0 100 30" fill="none">
                  <path
                    d="M5 22C20 22 25 12 40 12C55 12 60 25 75 25C90 25 95 8 110 8"
                    stroke="#A855F7"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </Card>

          {/* Card 2: Messages Received */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Messages
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{stats.messages ?? 0}</h4>
                <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${messageChange.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <span>{messageChange.positive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}</span>
                  <span>{messageChange.label}</span>
                </div>
              </div>
              <div className="w-16 h-8 opacity-80">
                <svg className="w-full h-full" viewBox="0 0 100 30" fill="none">
                  <path
                    d="M5 10C20 10 25 22 40 22C55 22 60 8 75 8C90 8 95 18 110 18"
                    stroke="#F43F5E"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </Card>

          {/* Card 3: Orders Placed */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Orders
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{stats.orders}</h4>
                <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${orderChange.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <span>{orderChange.positive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}</span>
                  <span>{orderChange.label}</span>
                </div>
              </div>
              <div className="w-16 h-8 opacity-80">
                <svg className="w-full h-full" viewBox="0 0 100 30" fill="none">
                  <path
                    d="M5 18C20 18 25 25 40 25C55 25 60 10 75 10C90 10 95 20 110 20"
                    stroke="#10B981"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </Card>

          {/* Card 4: Revenue */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Revenue
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  }).format(stats.revenue ?? 0)}
                </h4>
                <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${revenueChange.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <span>{revenueChange.positive ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}</span>
                  <span>{revenueChange.label}</span>
                </div>
              </div>
              <div className="w-16 h-8 opacity-80">
                <svg className="w-full h-full" viewBox="0 0 100 30" fill="none">
                  <path
                    d="M5 12C20 12 25 5 40 5C55 5 60 22 75 22C90 22 95 15 110 15"
                    stroke="#3B82F6"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
