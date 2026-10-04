import { z } from '@hono/zod-openapi';
import { uuidSchema } from '@shared/schemas/base';

const int = z.number().int();
const money = z.number();

/**
 * Counts that only mean something inside a time window. `previous` carries the
 * same shape for the window immediately before, which is what makes the dashboard's
 * delta chips honest: both sides cover exactly `range.days` and neither is a
 * lifetime total.
 */
export const adminWindowMetricsSchema = z
  .object({
    conversations: int,
    messages: int,
    inboundMessages: int,
    outboundMessages: int,
    orders: int,
    revenue: money,
    visits: int,
    llmTokens: int,
    estimatedCostUsd: money,
    agentRuns: int,
  })
  .openapi('AdminWindowMetrics');

/** Everything here is a lifetime count, so it is never compared to a window. */
export const adminSnapshotSchema = z
  .object({
    users: int,
    businesses: int,
    publishedStores: int,
    channels: int,
    products: int,
  })
  .openapi('AdminSnapshot');

/**
 * One calendar day in the reader's own zone, so a merchant in Karachi and an
 * operator in London both see the day the row happened on for them. Missing days
 * are emitted as zeroes rather than left out — a gap in a bar chart would read as
 * a bug, not as a quiet day.
 */
export const adminDailyPointSchema = z
  .object({
    date: z.string().length(10),
    visits: int,
    conversations: int,
    messagesIn: int,
    messagesOut: int,
    orders: int,
    revenue: money,
    tokens: int,
    costUsd: money,
  })
  .openapi('AdminDailyPoint');

export const adminTopBusinessSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    slug: z.string().nullable(),
    conversations: int,
    messages: int,
    orders: int,
    revenue: money,
  })
  .openapi('AdminTopBusiness');

export const adminStatsResponseSchema = z
  .object({
    range: z.object({
      days: int,
      tz: z.string(),
      startTime: z.string(),
      endTime: z.string(),
    }),
    snapshot: adminSnapshotSchema,
    window: adminWindowMetricsSchema,
    previous: adminWindowMetricsSchema,
    daily: z.array(adminDailyPointSchema),
    topBusinesses: z.array(adminTopBusinessSchema),
    /**
     * Read from the log store rather than Postgres, so the dashboard can say "nothing
     * is broken" as well as "here is the traffic". Counted out of at most `cap` rows
     * per kind — a log query is billed by what it returns, so a number equal to `cap`
     * means "this many or more", which is what the UI renders. The window is clamped
     * to what the log store retains, so it can be narrower than `range.days`.
     *
     * Null when the log store itself failed: a console that cannot answer "how many
     * errors" still has every Postgres number on the page, and one unavailable store
     * must not turn the whole dashboard into a 500.
     */
    anomalies: z
      .object({ errors: int, authRejections: int, cap: int })
      .nullable(),
  })
  .openapi('AdminStatsResponse');

export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;
export type AdminWindowMetrics = z.infer<typeof adminWindowMetricsSchema>;
export type AdminSnapshot = z.infer<typeof adminSnapshotSchema>;
export type AdminDailyPoint = z.infer<typeof adminDailyPointSchema>;
export type AdminTopBusiness = z.infer<typeof adminTopBusinessSchema>;
