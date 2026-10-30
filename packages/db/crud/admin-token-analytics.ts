import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, hourlyTokenAnalytics } from '@db/schema';
import { getModelBilling, ratesOf, tokenCostUsd } from './model-billing';

/**
 * Per-business LLM usage for the operator console, read from the hourly rollup the agent
 * writes (`hourly_token_analytics`) so a month of traffic costs one grouped scan instead
 * of a walk over every run. Nothing here is scoped to the caller's own store, which is why
 * the merchant dashboard no longer asks for these numbers.
 *
 * The rollup is the same source the cost figures on `/admin` come from, so the two agree —
 * including in being a floor: a run that failed before `recordTokenUsage` wrote is absent
 * from both.
 */

const inputTokens = sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalInputTokens}), 0)::int`;
const outputTokens = sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalOutputTokens}), 0)::int`;
const totalTokens = sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalTokens}), 0)::int`;
const cacheHitTokens = sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalCacheHitTokens}), 0)::int`;
const cacheMissTokens = sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalCacheMissTokens}), 0)::int`;
const runCount = sql<number>`coalesce(sum(${hourlyTokenAnalytics.runCount}), 0)::int`;

/**
 * Tokens that a run read from the model's prompt cache, as a share of what it sent. Cached
 * reads are a subset of input tokens, so the denominator is input, not total.
 */
const cacheHitPercent = sql<number>`coalesce(round((${cacheHitTokens}::numeric / nullif(${inputTokens}, 0)) * 100, 2), 0)::float`;

/**
 * Tokens per run. `avg_tokens_per_message` is stored per bucket and cannot be averaged again
 * without weighting by that bucket's run count; dividing the two sums is the same number
 * computed once, and it survives a bucket that held a single run.
 */
const avgTokensPerRun = sql<number>`coalesce(round(${totalTokens}::numeric / nullif(${runCount}, 0), 2), 0)::float`;

/**
 * Each bucket holds the mean latency of its own runs, so the window's mean is those means
 * weighted by how many runs each one stands for.
 */
const avgLatencyMs = sql<number>`coalesce(round(sum(${hourlyTokenAnalytics.avgLatencyMs}::numeric * ${hourlyTokenAnalytics.runCount}) / nullif(${runCount}, 0)), 0)::float`;

const bucketWindow = (start: Date, end: Date) =>
  and(gte(hourlyTokenAnalytics.hourBucket, start), lt(hourlyTokenAnalytics.hourBucket, end));

export type AdminBusinessTokenUsage = {
  businessId: string;
  name: string;
  slug: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  runCount: number;
  avgTokensPerRun: number;
  cacheHitPercent: number;
  estimatedCostUsd: number;
};

/**
 * Every store that used the agent in the window, heaviest first. Stores with no usage are
 * left out rather than listed as zeroes: the console is a cost review, and a list of silent
 * accounts is what `/admin`'s snapshot already counts.
 */
export async function listBusinessTokenUsage(
  start: Date,
  end: Date,
): Promise<AdminBusinessTokenUsage[]> {
  const rates = ratesOf(await getModelBilling());
  const rows = await db
    .select({
      businessId: hourlyTokenAnalytics.businessId,
      name: businesses.name,
      slug: businesses.slug,
      totalTokens,
      inputTokens,
      outputTokens,
      cacheHitTokens,
      cacheMissTokens,
      runCount,
      avgTokensPerRun,
      cacheHitPercent,
    })
    .from(hourlyTokenAnalytics)
    .innerJoin(businesses, eq(businesses.id, hourlyTokenAnalytics.businessId))
    .where(and(bucketWindow(start, end), isNull(businesses.deletedAt)))
    .groupBy(hourlyTokenAnalytics.businessId, businesses.name, businesses.slug);

  // The dollars are derived from the token counts at read time, so changing the rate card
  // reprices every month already on this page instead of only runs recorded afterwards.
  return rows
    .map((row) => ({
      ...row,
      estimatedCostUsd: tokenCostUsd(row, rates),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || a.name.localeCompare(b.name));
}

export type AdminTokenTotals = Omit<AdminBusinessTokenUsage, 'businessId' | 'name' | 'slug'> & {
  avgLatencyMs: number;
};

export type AdminTokenIntegrationUsage = {
  integrationType: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  runCount: number;
  avgTokensPerRun: number;
  cacheHitPercent: number;
  estimatedCostUsd: number;
};

export type AdminTokenDailyPoint = {
  date: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  runCount: number;
  estimatedCostUsd: number;
};

export type AdminBusinessTokenDetail = {
  business: { id: string; name: string; slug: string | null };
  totals: AdminTokenTotals;
  byIntegration: AdminTokenIntegrationUsage[];
  daily: AdminTokenDailyPoint[];
};

/**
 * One store's usage, broken down the way the operator reads it: what it spent, which
 * pipeline spent it, and on which days. Days are UTC — the rollup buckets are UTC hours, and
 * re-bucketing them into the reader's zone would make this page's daily bars disagree with
 * the platform dashboard's, which group `created_at` rather than a stored bucket.
 */
export async function getBusinessTokenUsageDetail(
  businessId: string,
  start: Date,
  end: Date,
): Promise<AdminBusinessTokenDetail | null> {
  const inWindow = and(
    eq(hourlyTokenAnalytics.businessId, businessId),
    gte(hourlyTokenAnalytics.hourBucket, start),
    lt(hourlyTokenAnalytics.hourBucket, end),
  );
  const byDay = sql`1`;
  const rates = ratesOf(await getModelBilling());

  const [businessRow, totalsRow, integrationRows, dailyRows] = await Promise.all([
    db
      .select({ id: businesses.id, name: businesses.name, slug: businesses.slug })
      .from(businesses)
      .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
      .limit(1),
    db
      .select({
        totalTokens,
        inputTokens,
        outputTokens,
        cacheHitTokens,
        cacheMissTokens,
        runCount,
        avgTokensPerRun,
        avgLatencyMs,
        cacheHitPercent,
      })
      .from(hourlyTokenAnalytics)
      .where(inWindow),
    db
      .select({
        integrationType: hourlyTokenAnalytics.integrationType,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheHitTokens,
        runCount,
        avgTokensPerRun,
        cacheHitPercent,
      })
      .from(hourlyTokenAnalytics)
      .where(inWindow)
      .groupBy(hourlyTokenAnalytics.integrationType),
    db
      .select({
        date: sql<string>`to_char(${hourlyTokenAnalytics.hourBucket}, 'YYYY-MM-DD')`,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheHitTokens,
        runCount,
      })
      .from(hourlyTokenAnalytics)
      .where(inWindow)
      .groupBy(byDay),
  ]);

  // Deleted, or never existed: the list page can only link here for a live store, so a
  // missing row means the slug was typed or the store went away since.
  const business = businessRow[0];
  if (!business) return null;

  const zero = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    runCount: 0,
    avgTokensPerRun: 0,
    avgLatencyMs: 0,
    cacheHitPercent: 0,
    estimatedCostUsd: 0,
  };

  const totals = totalsRow[0] ?? zero;
  return {
    business,
    totals: { ...totals, estimatedCostUsd: tokenCostUsd(totals, rates) },
    byIntegration: integrationRows
      .map((row) => ({
        ...row,
        integrationType: String(row.integrationType),
        estimatedCostUsd: tokenCostUsd(row, rates),
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    daily: dailyRows
      .map((row) => ({ ...row, estimatedCostUsd: tokenCostUsd(row, rates) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
