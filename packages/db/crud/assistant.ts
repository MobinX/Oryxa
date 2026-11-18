import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { assistantUsage, businesses, plans, publicChatUsage } from '@db/schema';
import type { AssistantQuotaStatus, QuotaCycle } from '@repo/shared';
import { cycleOf } from '@db/crud/billing';

/**
 * Assistant-chat budgets. Two doors:
 * - public: anonymous landing visitors, one integer per (salted IP hash, UTC day).
 * - assistant: signed-in merchants, one integer per (business, 30-day cycle),
 *   read against the same plan pointer and cycle anchor as the reply caps.
 *
 * The spends are single conditional upserts (neon-http has no transactions), the
 * same shape as spendQuotaUnit in crud/billing.ts. There are no threshold
 * notices: the widget and the assistant page render the remaining count live.
 */

const ASSISTANT_COUNTER = 'used' as const;

/** UTC day label, the public cap's key. */
export function publicChatDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The key stored for a visitor. A salted SHA-256, not the address: the row must
 * be useless if the table leaks, and the API never logs the raw IP.
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/** The plan a business is actually under, plus this cycle's key — assistant lane. */
export async function resolveAssistantPlan(
  businessId: string,
  now: Date = new Date(),
): Promise<{ limit: number | null; assigned: boolean; planId: string | null; planName: string | null; cycle: QuotaCycle } | null> {
  const [row] = await db
    .select({
      planId: businesses.planId,
      planStartedAt: businesses.planStartedAt,
      createdAt: businesses.createdAt,
      livePlanId: plans.id,
      planName: plans.name,
      assistantLimit: plans.assistantLimit,
      assistantLimitOverride: businesses.assistantLimitOverride,
    })
    .from(businesses)
    // A soft-deleted plan stops enforcing: the join falls away and the limit is NULL.
    .leftJoin(plans, and(eq(plans.id, businesses.planId), isNull(plans.deletedAt)))
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) return null;

  const anchor = row.planStartedAt ?? row.createdAt ?? now;
  const cycle = cycleOf(anchor, now);
  return {
    // A custom cap wins over the plan, including on a business with no plan at all.
    limit: row.assistantLimitOverride ?? row.assistantLimit,
    assigned: row.livePlanId !== null,
    planId: row.livePlanId,
    planName: row.planName,
    cycle,
  };
}

/** Everything the assistant page renders: the cap, this cycle's spend, the reset date. */
export async function getAssistantQuotaStatus(
  businessId: string,
  now: Date = new Date(),
): Promise<AssistantQuotaStatus | null> {
  const resolved = await resolveAssistantPlan(businessId, now);
  if (!resolved) return null;

  const [usage] = await db
    .select()
    .from(assistantUsage)
    .where(and(eq(assistantUsage.businessId, businessId), eq(assistantUsage.period, resolved.cycle.period)))
    .limit(1);

  const used = usage?.used ?? 0;
  return {
    assigned: resolved.assigned,
    planId: resolved.planId,
    planName: resolved.planName,
    cycle: resolved.cycle,
    assistantLimit: resolved.limit,
    used,
    blocked: resolved.limit !== null && used >= resolved.limit,
  };
}

export type AssistantSpendResult = {
  /** False means the cap was already reached and nothing was counted. */
  spent: boolean;
  period: string;
  limit: number | null;
  /** The new total when `spent`; null when refused. */
  used: number | null;
};

/**
 * Buy one assistant turn, or find out there is none left. The INSERT branch
 * needs its own guard: with no row yet for this cycle a plan capped at 0 would
 * otherwise grant a first turn anyway.
 */
export async function spendAssistantMessage(
  businessId: string,
  now: Date = new Date(),
): Promise<AssistantSpendResult> {
  const resolved = await resolveAssistantPlan(businessId, now);
  if (!resolved) {
    return { spent: true, period: publicChatDay(now), limit: null, used: null };
  }

  const { limit, cycle } = resolved;
  const period = cycle.period;
  const column = sql.identifier(ASSISTANT_COUNTER);

  const result = await db.execute(sql`
    INSERT INTO "assistant_usage" (id, business_id, period, used, updated_at)
    SELECT gen_random_uuid(), ${businessId}::uuid, ${period}, 1, now()
    WHERE ${limit}::int IS NULL OR ${limit}::int > 0
    ON CONFLICT (business_id, period) DO UPDATE SET
      ${column} = assistant_usage.${column} + EXCLUDED.${column},
      updated_at = now()
    WHERE ${limit}::int IS NULL OR assistant_usage.${column} < ${limit}::int
    RETURNING ${column} as used
  `);

  const rows = (result as { rows?: unknown } | null)?.rows ?? result;
  const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, number>) : null;
  if (!first) return { spent: false, period, limit, used: null };
  return { spent: true, period, limit, used: Number(first.used) };
}

/** Give a turn back when the model call failed after we bought it. */
export async function refundAssistantMessage(businessId: string, period: string): Promise<void> {
  await db.execute(sql`
    UPDATE "assistant_usage"
    SET used = GREATEST(used - 1, 0), updated_at = now()
    WHERE business_id = ${businessId}::uuid AND period = ${period}
  `);
}

export type PublicChatSpendResult = {
  /** False means today's cap for this IP is reached. */
  spent: boolean;
  used: number;
};

/**
 * Buy one anonymous turn against today's (IP hash, day) row, capped at `limit`.
 * One statement, so N serverless instances share the cap instead of each
 * keeping their own.
 */
export async function spendPublicChatMessage(
  ipHash: string,
  day: string,
  limit: number,
): Promise<PublicChatSpendResult> {
  const result = await db.execute(sql`
    INSERT INTO "public_chat_usage" (id, ip_hash, day, count, updated_at)
    SELECT gen_random_uuid(), ${ipHash}, ${day}, 1, now()
    WHERE ${limit}::int > 0
    ON CONFLICT (ip_hash, day) DO UPDATE SET
      count = public_chat_usage.count + EXCLUDED.count,
      updated_at = now()
    WHERE public_chat_usage.count < ${limit}::int
    RETURNING count as used
  `);

  const rows = (result as { rows?: unknown } | null)?.rows ?? result;
  const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, number>) : null;
  if (!first) {
    const [row] = await db
      .select({ count: publicChatUsage.count })
      .from(publicChatUsage)
      .where(and(eq(publicChatUsage.ipHash, ipHash), eq(publicChatUsage.day, day)))
      .limit(1);
    return { spent: false, used: row?.count ?? limit };
  }
  return { spent: true, used: Number(first.used) };
}
