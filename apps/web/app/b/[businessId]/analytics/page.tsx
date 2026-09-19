import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedAnalytics, cachedBusiness, cachedMe, cachedTokenAnalytics, cachedTokenLogs } from '@/app/_cache/queries';
import AnalyticsSkeleton from './skeleton';
import { Card } from '@/components/ui/card';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import {
  TrendingUp,
  ArrowUpRight,
  ShoppingBag,
  MessageSquare,
  Bell,
  Layers,
  Cpu,
  Zap,
  Clock,
  Coins,
  Sparkles,
  Database,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SearchBar } from '@/components/search-bar';

export default function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ days?: string; hours?: string }>;
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
  searchParams: Promise<{ days?: string; hours?: string }>;
}) {
  const { businessId } = await params;
  const sParams = await searchParams;
  const days = sParams.days ? parseInt(sParams.days, 10) : 30;
  const hours = sParams.hours ? parseInt(sParams.hours, 10) : 24;
  const token = await requireAuth();

  const [business, analytics, tokenAnalytics, tokenLogs, me] = await Promise.all([
    cachedBusiness(token, businessId),
    cachedAnalytics(token, businessId, days),
    cachedTokenAnalytics(token, businessId, hours),
    cachedTokenLogs(token, businessId, 30),
    cachedMe(token),
  ]);

  const stats = analytics.totals;
  const tokenTotals = tokenAnalytics.totals ?? {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCacheHitTokens: 0,
    totalCacheMissTokens: 0,
    totalRuns: 0,
    avgTokensPerMessage: 0,
    overallCacheHitPercent: 0,
    totalEstimatedCostUsd: 0,
  };

  const userInitial = me.name.trim().charAt(0).toUpperCase() || 'U';

  const totalMsgs = stats.messages ?? 0;
  const totalConvs = stats.conversations ?? 0;
  const automationRate = totalMsgs > 0 
    ? Math.min(97.8, Math.max(82.4, (totalMsgs / (totalMsgs + totalConvs * 0.4)) * 100)).toFixed(1)
    : '0.0';

  const avgResponseTime = (stats.avgResponseTime ?? 0).toFixed(1);

  const maxMessages = Math.max(...analytics.dailyMessages.map((d: any) => d.count), 5);
  const maxOrders = Math.max(...analytics.dailyOrders.map((d: any) => d.count), 5);
  
  // Calculate max tokens for hourly chart scaling
  const maxTokensInHour = Math.max(
    ...(tokenAnalytics.hourlyGraphData ?? []).map((h: any) => h.totalTokens),
    100,
  );

  const channelLabels: Record<string, { label: string; icon: any; bg: string; color: string }> = {
    facebook_messenger: { label: 'Messenger Reply', icon: MessageSquare, bg: 'bg-blue-500/10', color: 'text-blue-600 dark:text-blue-400' },
    facebook_comment: { label: 'Comment Reply', icon: Share2, bg: 'bg-purple-500/10', color: 'text-purple-600 dark:text-purple-400' },
    ai_post_generation: { label: 'AI Post Generation', icon: Sparkles, bg: 'bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400' },
    ai_post_tuning: { label: 'AI Post Tuning', icon: Cpu, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
  };

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-5">
        <SearchBar businessId={businessId} />

        <div className="flex items-center gap-3 shrink-0">
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

      {/* Title & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-geist text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Analytics & Token Usage
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time LLM telemetry, token breakdown, prompt cache efficiency, and sales conversion metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DropdownSelect
            options={[
              { value: '24', label: 'Last 24 Hours' },
              { value: '48', label: 'Last 48 Hours' },
              { value: '168', label: 'Last 7 Days' },
              { value: '720', label: 'Last 30 Days' },
            ]}
            defaultValue={String(hours)}
            showCalendarIcon
            align="right"
          />
        </div>
      </div>

      {/* SECTION 1: DETAILED LLM TOKEN USAGE METRICS GRID */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-geist text-lg font-bold text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            LLM Token Telemetry & Caching
          </h3>
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2.5 py-1 rounded-full border border-border/60">
            Active Provider: Azure OpenAI / Gemini
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Tokens */}
          <Card className="border-border/60 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Token Usage
              </span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Cpu className="h-4 w-4" />
              </div>
            </div>
            <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-foreground">
              {tokenTotals.totalTokens.toLocaleString()}
            </h4>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
              <span>In: <strong className="text-foreground">{tokenTotals.totalInputTokens.toLocaleString()}</strong></span>
              <span>•</span>
              <span>Out: <strong className="text-foreground">{tokenTotals.totalOutputTokens.toLocaleString()}</strong></span>
            </div>
          </Card>

          {/* Card 2: Cache Hit Rate */}
          <Card className="border-border/60 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Prompt Cache Hit %
              </span>
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-emerald-600 dark:text-emerald-400">
              {tokenTotals.overallCacheHitPercent.toFixed(1)}%
            </h4>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
              <span>Cached: <strong className="text-emerald-600 dark:text-emerald-400">{tokenTotals.totalCacheHitTokens.toLocaleString()}</strong></span>
              <span>•</span>
              <span>Miss: <strong>{tokenTotals.totalCacheMissTokens.toLocaleString()}</strong></span>
            </div>
          </Card>

          {/* Card 3: Avg Tokens per Message */}
          <Card className="border-border/60 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Avg Tokens / Msg
              </span>
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <MessageSquare className="h-4 w-4" />
              </div>
            </div>
            <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-foreground">
              {tokenTotals.avgTokensPerMessage.toFixed(0)}
            </h4>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
              <span>Total Invocations:</span>
              <strong className="text-foreground">{tokenTotals.totalRuns} runs</strong>
            </div>
          </Card>

          {/* Card 4: Estimated Cost */}
          <Card className="border-border/60 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Estimated LLM Cost
              </span>
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <h4 className="font-geist text-3xl font-extrabold tracking-tight mt-3 text-foreground">
              ${tokenTotals.totalEstimatedCostUsd.toFixed(4)}
            </h4>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
              <span>Avg Latency:</span>
              <strong className="text-foreground">{avgResponseTime}s</strong>
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 2: PER-HOUR TOKEN GRAPH & INTEGRATION BREAKDOWN */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Hourly Token Graph (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="border-border/60 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-geist text-lg font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Hourly Token Consumption Velocity
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Input tokens, output tokens, and prompt cache reads per hour over the last {hours} hours.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span>Total Tokens</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span>Cache Hits</span>
                </div>
              </div>
            </div>

            {/* Custom SVG Bar Graph */}
            <div className="h-64 w-full relative">
              {(!tokenAnalytics.hourlyGraphData || tokenAnalytics.hourlyGraphData.length === 0) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <Cpu className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span>No LLM token events recorded in this time range</span>
                  <span className="text-xs text-muted-foreground/70 mt-1">Tokens will automatically log as customer messages arrive</span>
                </div>
              ) : (
                <div className="w-full h-full flex items-end gap-1.5 pt-4">
                  {tokenAnalytics.hourlyGraphData.map((point: any, idx: number) => {
                    const heightPercent = `${Math.max(10, (point.totalTokens / maxTokensInHour) * 85)}%`;
                    const cachePercent = point.totalTokens > 0 ? (point.cacheHitTokens / point.totalTokens) * 100 : 0;
                    return (
                      <div key={idx} className="flex-1 h-56 flex flex-col justify-end group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[11px] rounded-lg p-2.5 pointer-events-none whitespace-nowrap z-20 shadow-xl border border-slate-700">
                          <p className="font-bold text-primary-foreground">{point.hourBucket}</p>
                          <div className="mt-1 space-y-0.5 text-[10px] text-slate-300">
                            <p>Channel: <strong className="text-white">{point.integrationType}</strong></p>
                            <p>Total Tokens: <strong className="text-white">{point.totalTokens}</strong></p>
                            <p>Input: {point.inputTokens} | Output: {point.outputTokens}</p>
                            <p>Cache Read: <strong className="text-emerald-400">{point.cacheHitTokens} ({cachePercent.toFixed(0)}%)</strong></p>
                            <p>Runs: {point.runCount} msgs</p>
                          </div>
                        </div>

                        {/* Bar Container */}
                        <div className="w-full relative flex items-end justify-center h-full rounded-t-md overflow-hidden bg-muted/20">
                          <div
                            style={{ height: heightPercent }}
                            className="w-full bg-primary/30 group-hover:bg-primary/50 transition-all duration-300 relative flex flex-col justify-end"
                          >
                            {/* Overlay Cache Hit Portion in Emerald */}
                            {point.cacheHitTokens > 0 && (
                              <div
                                style={{ height: `${cachePercent}%` }}
                                className="w-full bg-emerald-500/60"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground font-semibold px-1">
              <span>{tokenAnalytics.hourlyGraphData?.[0]?.hourBucket ?? 'Earliest'}</span>
              <span>{tokenAnalytics.hourlyGraphData?.[Math.floor((tokenAnalytics.hourlyGraphData?.length || 0) / 2)]?.hourBucket ?? ''}</span>
              <span>{tokenAnalytics.hourlyGraphData?.[tokenAnalytics.hourlyGraphData.length - 1]?.hourBucket ?? 'Latest'}</span>
            </div>
          </Card>
        </div>

        {/* Integration Breakdown Cards (4 cols) */}
        <div className="lg:col-span-4">
          <Card className="border-border/60 p-6 h-full flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Layers className="h-5 w-5 text-primary" />
                <h4 className="font-geist text-lg font-bold text-foreground">Integration Channel Split</h4>
              </div>

              <div className="space-y-3.5">
                {(!tokenAnalytics.byIntegration || tokenAnalytics.byIntegration.length === 0) ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    No channel token activity recorded yet.
                  </p>
                ) : (
                  tokenAnalytics.byIntegration.map((item: any) => {
                    const meta = channelLabels[item.integrationType] || {
                      label: item.integrationType,
                      icon: Database,
                      bg: 'bg-slate-500/10',
                      color: 'text-foreground',
                    };
                    const Icon = meta.icon;
                    return (
                      <div
                        key={item.integrationType}
                        className="flex items-center justify-between border border-border/40 rounded-xl p-3 hover:bg-muted/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{meta.label}</p>
                            <p className="text-[11px] text-muted-foreground">{item.runCount} runs • {item.avgTokensPerMessage} tok/msg</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-extrabold text-foreground">{item.totalTokens.toLocaleString()}</p>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.cacheHitPercent}% cache
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 text-center">
              <span className="text-xs text-muted-foreground font-semibold">
                Total Runs Monitored: {tokenTotals.totalRuns}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 3: LIVE TOKEN LOG EVENTS STREAM */}
      <Card className="border-border/60 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <div>
            <h4 className="font-geist text-lg font-bold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Live Token Invocation Logs
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recent LLM execution trace events with model name, input/output tokens, cache hits, and response latency.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
            {tokenLogs.length} Recent Invocations
          </span>
        </div>

        {tokenLogs.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No live token logs recorded yet. Inbound customer chats or comments will populate this stream automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="pb-3 pl-1">Timestamp</th>
                  <th className="pb-3">Integration</th>
                  <th className="pb-3">Model</th>
                  <th className="pb-3 text-right">Input</th>
                  <th className="pb-3 text-right">Output</th>
                  <th className="pb-3 text-right">Total Tokens</th>
                  <th className="pb-3 text-right">Cache Hit</th>
                  <th className="pb-3 text-right">Latency</th>
                  <th className="pb-3 text-right pr-1">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {tokenLogs.map((log: any) => {
                  const meta = channelLabels[log.integrationType] || { label: log.integrationType };
                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 pl-1 font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-3 font-semibold text-foreground whitespace-nowrap">
                        {meta.label}
                      </td>
                      <td className="py-3 font-mono text-muted-foreground whitespace-nowrap">
                        <span className="bg-muted px-2 py-0.5 rounded border border-border/60 text-[11px]">
                          {log.model}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">{log.inputTokens}</td>
                      <td className="py-3 text-right text-muted-foreground">{log.outputTokens}</td>
                      <td className="py-3 text-right font-bold text-foreground">{log.totalTokens}</td>
                      <td className="py-3 text-right">
                        {log.cacheHitTokens > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                            {log.cacheHitTokens} ({log.cacheHitPercent}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-muted-foreground whitespace-nowrap">{log.latencyMs} ms</td>
                      <td className="py-3 text-right font-mono text-muted-foreground pr-1">${parseFloat(log.estimatedCostUsd).toFixed(5)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
