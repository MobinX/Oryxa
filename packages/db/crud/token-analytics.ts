import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { db } from '@db/client';
import { llmTokenLogs, hourlyTokenAnalytics } from '@db/schema';
import type { IntegrationType } from '@repo/shared';

export interface RecordTokenUsageInput {
  businessId: string;
  channelId?: string | null;
  conversationId?: string | null;
  commentThreadId?: string | null;
  postId?: string | null;
  messageId?: string | null;
  integrationType: IntegrationType;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitPercent: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

export async function recordTokenUsage(input: RecordTokenUsageInput) {
  // 1. Log granular event record
  const [log] = await db
    .insert(llmTokenLogs)
    .values({
      businessId: input.businessId,
      channelId: input.channelId || null,
      conversationId: input.conversationId || null,
      commentThreadId: input.commentThreadId || null,
      postId: input.postId || null,
      messageId: input.messageId || null,
      integrationType: input.integrationType,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      cacheHitTokens: input.cacheHitTokens,
      cacheMissTokens: input.cacheMissTokens,
      cacheHitPercent: input.cacheHitPercent.toFixed(2),
      latencyMs: input.latencyMs,
      estimatedCostUsd: input.estimatedCostUsd.toFixed(6),
    })
    .returning();

  // 2. Truncate timestamp to start of hour
  const now = new Date();
  const hourBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  // 3. Perform atomic upsert into hourly_token_analytics
  const cacheHitPercentStr = input.cacheHitPercent.toFixed(2);
  const estimatedCostStr = input.estimatedCostUsd.toFixed(6);

  await db.execute(sql`
    INSERT INTO hourly_token_analytics (
      id, business_id, integration_type, hour_bucket,
      total_input_tokens, total_output_tokens, total_tokens,
      total_cache_hit_tokens, total_cache_miss_tokens,
      run_count, avg_tokens_per_message, avg_latency_ms, total_estimated_cost_usd, updated_at
    ) VALUES (
      gen_random_uuid(), ${input.businessId}::uuid, ${input.integrationType}::integration_type, ${hourBucket},
      ${input.inputTokens}, ${input.outputTokens}, ${input.totalTokens},
      ${input.cacheHitTokens}, ${input.cacheMissTokens},
      1, ${input.totalTokens}, ${input.latencyMs}, ${estimatedCostStr}::numeric, NOW()
    )
    ON CONFLICT (business_id, integration_type, hour_bucket) DO UPDATE SET
      total_input_tokens = hourly_token_analytics.total_input_tokens + EXCLUDED.total_input_tokens,
      total_output_tokens = hourly_token_analytics.total_output_tokens + EXCLUDED.total_output_tokens,
      total_tokens = hourly_token_analytics.total_tokens + EXCLUDED.total_tokens,
      total_cache_hit_tokens = hourly_token_analytics.total_cache_hit_tokens + EXCLUDED.total_cache_hit_tokens,
      total_cache_miss_tokens = hourly_token_analytics.total_cache_miss_tokens + EXCLUDED.total_cache_miss_tokens,
      run_count = hourly_token_analytics.run_count + 1,
      avg_tokens_per_message = ROUND((hourly_token_analytics.total_tokens + EXCLUDED.total_tokens)::numeric / (hourly_token_analytics.run_count + 1), 2),
      avg_latency_ms = ROUND((hourly_token_analytics.avg_latency_ms * hourly_token_analytics.run_count + EXCLUDED.avg_latency_ms)::numeric / (hourly_token_analytics.run_count + 1)),
      total_estimated_cost_usd = hourly_token_analytics.total_estimated_cost_usd + EXCLUDED.total_estimated_cost_usd,
      updated_at = NOW()
  `);

  return log;
}

export async function getBusinessTokenAnalytics(businessId: string, hours: number = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // 1. Cumulative totals for the business
  const [totalsRow] = await db
    .select({
      totalInputTokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalInputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalOutputTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalTokens}), 0)::int`,
      totalCacheHitTokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalCacheHitTokens}), 0)::int`,
      totalCacheMissTokens: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalCacheMissTokens}), 0)::int`,
      totalRuns: sql<number>`coalesce(sum(${hourlyTokenAnalytics.runCount}), 0)::int`,
      avgTokensPerMessage: sql<number>`coalesce(round(sum(${hourlyTokenAnalytics.totalTokens})::numeric / nullif(sum(${hourlyTokenAnalytics.runCount}), 0), 2), 0)::float`,
      overallCacheHitPercent: sql<number>`coalesce(round((sum(${hourlyTokenAnalytics.totalCacheHitTokens})::numeric / nullif(sum(${hourlyTokenAnalytics.totalInputTokens}), 0)) * 100, 2), 0)::float`,
      totalEstimatedCostUsd: sql<number>`coalesce(sum(${hourlyTokenAnalytics.totalEstimatedCostUsd}), 0)::float`,
    })
    .from(hourlyTokenAnalytics)
    .where(
      and(
        eq(hourlyTokenAnalytics.businessId, businessId),
        gte(hourlyTokenAnalytics.hourBucket, cutoff),
      ),
    );

  // 2. Integration type breakdown
  const byIntegration = await db
    .select({
      integrationType: hourlyTokenAnalytics.integrationType,
      totalTokens: sql<number>`sum(${hourlyTokenAnalytics.totalTokens})::int`,
      runCount: sql<number>`sum(${hourlyTokenAnalytics.runCount})::int`,
      avgTokensPerMessage: sql<number>`round(sum(${hourlyTokenAnalytics.totalTokens})::numeric / sum(${hourlyTokenAnalytics.runCount}), 2)::float`,
      cacheHitPercent: sql<number>`round((sum(${hourlyTokenAnalytics.totalCacheHitTokens})::numeric / nullif(sum(${hourlyTokenAnalytics.totalInputTokens}), 0)) * 100, 2)::float`,
    })
    .from(hourlyTokenAnalytics)
    .where(
      and(
        eq(hourlyTokenAnalytics.businessId, businessId),
        gte(hourlyTokenAnalytics.hourBucket, cutoff),
      ),
    )
    .groupBy(hourlyTokenAnalytics.integrationType);

  // 3. Hourly time-series bucket array for UI graphing
  const hourlyGraphData = await db
    .select({
      hourBucket: sql<string>`to_char(${hourlyTokenAnalytics.hourBucket}, 'YYYY-MM-DD HH24:00')`,
      integrationType: hourlyTokenAnalytics.integrationType,
      inputTokens: sql<number>`sum(${hourlyTokenAnalytics.totalInputTokens})::int`,
      outputTokens: sql<number>`sum(${hourlyTokenAnalytics.totalOutputTokens})::int`,
      totalTokens: sql<number>`sum(${hourlyTokenAnalytics.totalTokens})::int`,
      cacheHitTokens: sql<number>`sum(${hourlyTokenAnalytics.totalCacheHitTokens})::int`,
      cacheMissTokens: sql<number>`sum(${hourlyTokenAnalytics.totalCacheMissTokens})::int`,
      runCount: sql<number>`sum(${hourlyTokenAnalytics.runCount})::int`,
    })
    .from(hourlyTokenAnalytics)
    .where(
      and(
        eq(hourlyTokenAnalytics.businessId, businessId),
        gte(hourlyTokenAnalytics.hourBucket, cutoff),
      ),
    )
    .groupBy(sql`to_char(${hourlyTokenAnalytics.hourBucket}, 'YYYY-MM-DD HH24:00')`, hourlyTokenAnalytics.integrationType)
    .orderBy(sql`to_char(${hourlyTokenAnalytics.hourBucket}, 'YYYY-MM-DD HH24:00')`);

  return {
    totals: totalsRow ?? {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCacheHitTokens: 0,
      totalCacheMissTokens: 0,
      totalRuns: 0,
      avgTokensPerMessage: 0,
      overallCacheHitPercent: 0,
      totalEstimatedCostUsd: 0,
    },
    byIntegration,
    hourlyGraphData,
  };
}

export async function listTokenLogs(businessId: string, limit: number = 50) {
  return db
    .select()
    .from(llmTokenLogs)
    .where(eq(llmTokenLogs.businessId, businessId))
    .orderBy(desc(llmTokenLogs.createdAt))
    .limit(limit);
}
