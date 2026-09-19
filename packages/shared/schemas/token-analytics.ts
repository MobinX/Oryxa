import { z } from '@hono/zod-openapi';

export const integrationTypeSchema = z.enum([
  'facebook_messenger',
  'facebook_comment',
  'instagram_messenger',
  'whatsapp',
  'ai_post_generation',
  'ai_post_tuning',
]);

export const tokenUsageTotalsSchema = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalTokens: z.number(),
  totalCacheHitTokens: z.number(),
  totalCacheMissTokens: z.number(),
  totalRuns: z.number(),
  avgTokensPerMessage: z.number(),
  overallCacheHitPercent: z.number(),
  totalEstimatedCostUsd: z.number(),
}).openapi('TokenUsageTotals');

export const integrationBreakdownItemSchema = z.object({
  integrationType: integrationTypeSchema,
  totalTokens: z.number(),
  runCount: z.number(),
  avgTokensPerMessage: z.number(),
  cacheHitPercent: z.number(),
}).openapi('IntegrationBreakdownItem');

export const hourlyGraphPointSchema = z.object({
  hourBucket: z.string(),
  integrationType: integrationTypeSchema,
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  cacheHitTokens: z.number(),
  cacheMissTokens: z.number(),
  runCount: z.number(),
}).openapi('HourlyGraphPoint');

export const tokenAnalyticsResponseSchema = z.object({
  totals: tokenUsageTotalsSchema,
  byIntegration: z.array(integrationBreakdownItemSchema),
  hourlyGraphData: z.array(hourlyGraphPointSchema),
}).openapi('TokenAnalyticsResponse');

export type IntegrationType = z.infer<typeof integrationTypeSchema>;
export type TokenUsageTotals = z.infer<typeof tokenUsageTotalsSchema>;
export type IntegrationBreakdownItem = z.infer<typeof integrationBreakdownItemSchema>;
export type HourlyGraphPoint = z.infer<typeof hourlyGraphPointSchema>;
export type TokenAnalyticsResponse = z.infer<typeof tokenAnalyticsResponseSchema>;
