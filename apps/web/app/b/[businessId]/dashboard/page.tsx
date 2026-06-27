import Link from 'next/link';
import { getBusinessForRequest, getBusinessStatsForRequest, getMeForRequest } from '@/lib/server-data';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import {
  Package,
  MessageSquare,
  ShoppingCart,
  Radio,
  Search,
  Bell,
  Calendar,
  ChevronDown,
  ArrowRight,
  TrendingUp,
  Plus,
  CheckCircle2,
  Clock,
  Eye,
  Activity,
  DollarSign,
  TrendingDown,
  Sparkles,
} from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';

const sparklinePaths = {
  products: 'M5 22C20 22 25 12 40 12C55 12 60 25 75 25C90 25 95 8 110 8',
  orders: 'M5 25C20 25 25 10 40 10C55 10 60 22 75 22C90 22 95 5 110 5',
  channels: 'M5 18C20 18 25 25 40 25C55 25 60 10 75 10C90 10 95 20 110 20',
  inbox: 'M5 12C20 12 25 5 40 5C55 5 60 22 75 22C90 22 95 15 110 15',
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const [business, stats, me] = await Promise.all([
    getBusinessForRequest(businessId),
    getBusinessStatsForRequest(businessId),
    getMeForRequest(),
  ]);
  const userInitial = me.name.trim().charAt(0).toUpperCase() || 'U';
  const totalViews = (stats.messages ?? 0) + (stats.conversations ?? 0) * 5 + 128;

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
      desc: 'Unread messages',
      icon: MessageSquare,
      color: 'text-blue-500 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-500/10',
      strokeColor: '#3B82F6',
      sparkline: sparklinePaths.inbox,
      href: 'inbox',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Navigation / Search Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full h-11 pl-4 pr-10 rounded-xl border border-border/80 bg-card/50 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>

        {/* Action Header Icons */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />

          {/* Notification bell */}
          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card hover:bg-muted transition-colors">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-primary" />
          </button>

          {/* Profile initial */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20">
            {userInitial}
          </div>
        </div>
      </div>

      {/* Greeting and Date Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Good morning, {me.name}! 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what's happening with your business today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownSelect
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'last7', label: 'Last 7 Days' },
            ]}
            defaultValue="today"
            showCalendarIcon
          />
          <DropdownSelect
            options={[
              { value: 'range', label: 'Jun 26 - Jun 26, 2026' },
              { value: 'range2', label: 'Jun 1 - Jun 30, 2026' },
            ]}
            defaultValue="range"
            align="right"
          />
        </div>
      </div>

      {/* Row 1: Four Statistics Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {topStats.map((item) => (
          <Link key={item.label} href={`/b/${businessId}/${item.href}`} className="block group">
            <Card className="hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.99] border-border/60">
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

                {/* SVG Sparkline Graph */}
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

              {/* Activity Log List */}
              <div className="space-y-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Plus className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Product added</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
                      New product "Goth Barbie Tee" was added.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap pt-0.5">
                    2h ago
                  </span>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <ShoppingCart className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Order received</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
                      New order #1234 received.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap pt-0.5">
                    5h ago
                  </span>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <MessageSquare className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">New message</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
                      You have a new message from Messenger.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap pt-0.5">
                    1d ago
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={`/b/${businessId}/inbox`}
              className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-muted/50 py-3 text-xs font-semibold text-primary hover:bg-muted transition-colors w-full"
            >
              View all activity
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>

        {/* Connect with Meta Promotion Card */}
        <div className="lg:col-span-7 flex">
          <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-800 p-8 text-white shadow-xl shadow-indigo-500/10 flex flex-col justify-between w-full min-h-[300px]">
            {/* Ambient Background Circles */}
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

              {/* Floating Social Icons Simulation */}
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
                Track your business performance at a glance.
              </p>
            </div>
          </div>
          <DropdownSelect
            options={[
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' },
            ]}
            defaultValue="week"
            align="right"
            className="h-9"
          />
        </div>

        {/* Four Performance Metrics cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Views */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total views
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{totalViews}</h4>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="text-xs">↑</span>
                  <span>12.5% vs last week</span>
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

          {/* Card 2: Engagement */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Engagement
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{stats.messages ?? 0}</h4>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="text-xs">↑</span>
                  <span>8.2% vs last week</span>
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

          {/* Card 3: Conversions */}
          <Card className="border-border/60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Conversions
                </span>
                <h4 className="font-geist text-2xl font-black text-foreground">{stats.orders}</h4>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="text-xs">↑</span>
                  <span>16.7% vs last week</span>
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
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="text-xs">↑</span>
                  <span>21.4% vs last week</span>
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
