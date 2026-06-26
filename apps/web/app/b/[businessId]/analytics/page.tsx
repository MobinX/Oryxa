import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import {
  BarChart3,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  ShoppingBag,
  MessageSquare,
  Users,
  Search,
  Bell,
  Calendar,
  ChevronDown,
} from 'lucide-react';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="space-y-8">
      {/* Search and Profile Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full h-11 pl-4 pr-10 rounded-xl border border-border/80 bg-card/50 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card hover:bg-muted transition-colors">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-primary" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20">
            Z
          </div>
        </div>
      </div>

      {/* Title & Filter bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Analytics Overview
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into customer engagement, chat automation, and sales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownSelect
            options={[
              { value: '30days', label: 'Last 30 Days' },
              { value: '7days', label: 'Last 7 Days' },
              { value: '12months', label: 'Last 12 Months' },
            ]}
            defaultValue="30days"
            showCalendarIcon
            align="right"
          />
        </div>
      </div>

      {/* Main metrics grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1 */}
        <Card className="border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Chat Automation Rate
              </p>
              <h3 className="font-geist text-4xl font-extrabold tracking-tight mt-2 text-foreground">
                94.2%
              </h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>+4.8% vs last month</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <MessageSquare className="h-6 w-6" />
            </div>
          </div>
        </Card>

        {/* Metric 2 */}
        <Card className="border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Average Response Time
              </p>
              <h3 className="font-geist text-4xl font-extrabold tracking-tight mt-2 text-foreground">
                1.4s
              </h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>-2.1s faster responses</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </Card>

        {/* Metric 3 */}
        <Card className="border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Attributed Sales
              </p>
              <h3 className="font-geist text-4xl font-extrabold tracking-tight mt-2 text-foreground">
                $1,240
              </h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>+12.4% vs last month</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Chart Simulation Section */}
      <Card className="border-border/60 p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5 mb-6">
          <div>
            <h4 className="font-geist text-lg font-bold text-foreground">Automation Trend</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily automated vs human-handled customer support messages.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="h-3 w-3 rounded-full bg-primary" />
              AI Automated (94%)
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-3 w-3 rounded-full bg-muted-foreground" />
              Human Handled (6%)
            </span>
          </div>
        </div>

        {/* Chart representation */}
        <div className="h-64 w-full flex items-end justify-between gap-2.5 pt-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-36" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Mon</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-44" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Tue</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-32" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Wed</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-52" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Thu</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-48" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Fri</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t-lg h-56" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Sat</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full bg-primary/30 hover:bg-primary/45 transition-colors rounded-t-lg h-60 border border-primary/20 shadow-lg shadow-primary/10" />
            <span className="text-[11px] font-semibold text-primary uppercase font-bold">Sun</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
