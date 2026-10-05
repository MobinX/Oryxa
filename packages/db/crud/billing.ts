import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, commentThreads, conversations, notifications, plans, quotaUsage } from '@db/schema';
import type { NotificationItem, NotificationKind, QuotaCycle, QuotaKind, QuotaStatus, QuotaThreshold } from '@repo/shared';

/**
 * Allowances, the gate's read, and the atomic counter.
 *
 * Raw SQL appears once here, in `spendQuotaUnit`, for the same reason it appears in
 * token-analytics.ts: the neon-http driver has no transactions, so "check the cap and
 * increment it" has to be one statement or two concurrent runs can both see room.
 * Everything else in this file is ordinary Drizzle.
 */

export const CYCLE_DAYS = 30;
const DAY_MS = 86_400_000;
/** Internal map, never a lookup on caller-supplied text: the SQL below interpolates one
 *  of exactly these two names as an identifier. */
const COUNTER_COLUMN = { message: 'messages_used', comment: 'comments_used' } as const;

function dateKey(msSinceEpoch: number): string {
  return new Date(msSinceEpoch).toISOString().slice(0, 10);
}

/**
 * The 30-day window `now` falls in, counted in whole UTC days from this business's
 * anchor. Returns the storage key plus the dates a merchant is shown.
 *
 * Deliberately Node-side, like the UTC-day keys in routes/visits.ts: no date_trunc, no
 * EXTRACT(EPOCH), no interval arithmetic, so Neon and PGlite cannot disagree about where
 * a boundary falls. The same function picks the key for the read and for the write, so a
 * boundary is always consistent inside one process even if its clock disagrees.
 */
export function cycleOf(anchor: Date, now: Date): QuotaCycle {
  const anchorDay = Math.floor(anchor.getTime() / DAY_MS);
  const nowDay = Math.floor(now.getTime() / DAY_MS);
  const elapsedDays = Math.max(0, nowDay - anchorDay);
  const startDay = anchorDay + Math.floor(elapsedDays / CYCLE_DAYS) * CYCLE_DAYS;
  const resetDay = startDay + CYCLE_DAYS;
  return {
    period: dateKey(startDay * DAY_MS),
    startedAt: dateKey(startDay * DAY_MS),
    resetsAt: dateKey(resetDay * DAY_MS),
    daysLeft: Math.min(CYCLE_DAYS, Math.max(0, resetDay - nowDay)),
  };
}

/** The plan a business is actually under right now, plus the cycle it is inside. */
export type ResolvedPlan = {
  businessId: string;
  /** False when unassigned or when the assigned plan was deleted — both mean unlimited. */
  assigned: boolean;
  planId: string | null;
  planName: string | null;
  messageLimit: number | null;
  commentLimit: number | null;
  cycle: QuotaCycle;
};

export async function resolvePlan(businessId: string, now: Date = new Date()): Promise<ResolvedPlan | null> {
  const [row] = await db
    .select({
      planId: businesses.planId,
      planStartedAt: businesses.planStartedAt,
      createdAt: businesses.createdAt,
      livePlanId: plans.id,
      planName: plans.name,
      messageLimit: plans.messageLimit,
      commentLimit: plans.commentLimit,
    })
    .from(businesses)
    // A soft-deleted plan must stop enforcing: the UI would say "no plan" while the caps
    // quietly still applied. Joining it away makes the limits NULL, which means uncapped.
    .leftJoin(plans, and(eq(plans.id, businesses.planId), isNull(plans.deletedAt)))
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) return null;

  // An unassigned business still needs a stable cycle so its volume is recorded, and the
  // honest anchor for one is the day it started — the same date the backfill uses.
  const anchor = row.planStartedAt ?? row.createdAt ?? now;

  return {
    businessId,
    assigned: row.livePlanId !== null,
    planId: row.livePlanId,
    planName: row.planName,
    messageLimit: row.messageLimit,
    commentLimit: row.commentLimit,
    cycle: cycleOf(anchor, now),
  };
}

function blocked(limit: number | null, used: number): boolean {
  return limit !== null && used >= limit;
}

/**
 * Everything the gate and the merchant's own pages need, in two indexed reads.
 * Returns null only when the business does not exist; it does not swallow database
 * errors — the caller that needs fail-open behaviour (the gate) asks for it explicitly.
 */
export async function getQuotaStatus(businessId: string, now: Date = new Date()): Promise<QuotaStatus | null> {
  const resolved = await resolvePlan(businessId, now);
  if (!resolved) return null;

  const [usage] = await db
    .select()
    .from(quotaUsage)
    .where(and(eq(quotaUsage.businessId, businessId), eq(quotaUsage.period, resolved.cycle.period)))
    .limit(1);

  // No row for this period is the reset. Nothing clears anything, nothing is scheduled:
  // the key rotated, so the old row is simply not the current one any more.
  const messagesUsed = usage?.messagesUsed ?? 0;
  const commentsUsed = usage?.commentsUsed ?? 0;

  return {
    assigned: resolved.assigned,
    planId: resolved.planId,
    planName: resolved.planName,
    cycle: resolved.cycle,
    messageLimit: resolved.messageLimit,
    commentLimit: resolved.commentLimit,
    messagesUsed,
    commentsUsed,
    messageBlocked: blocked(resolved.messageLimit, messagesUsed),
    commentBlocked: blocked(resolved.commentLimit, commentsUsed),
  };
}

/**
 * The business that owns a run, from the id the trigger helper was handed.
 *
 * The webhook already knows the answer and passes it, so this costs nothing there; it
 * exists for callers that do not. Without it a trigger helper would have to be given the
 * budget, and a future call site could skip the gate simply by leaving the argument out.
 * One read on a primary key, and the branch is explicit because the two tables have no
 * column in common a generic lookup could span.
 */
export async function businessForRun(kind: QuotaKind, runId: string): Promise<string | null> {
  const rows =
    kind === 'message'
      ? await db
          .select({ businessId: conversations.businessId })
          .from(conversations)
          .where(eq(conversations.id, runId))
          .limit(1)
      : await db
          .select({ businessId: commentThreads.businessId })
          .from(commentThreads)
          .where(eq(commentThreads.id, runId))
          .limit(1);
  return rows[0]?.businessId ?? null;
}

export type PlanCycleUsage = {
  businessId: string;
  period: string;
  resetsAt: string;
  messagesUsed: number;
  commentsUsed: number;
};

/**
 * Every live business on one plan and what it has used in the cycle it is inside.
 *
 * The operator's edit path needs this because lowering a cap is news to the businesses
 * already past the new number, and there is no job anywhere that would tell them later —
 * so the console writes their notices inside the same request that made the change.
 */
export async function cycleUsageOnPlan(planId: string, now: Date = new Date()): Promise<PlanCycleUsage[]> {
  const onPlan = await db
    .select({
      id: businesses.id,
      planStartedAt: businesses.planStartedAt,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(and(eq(businesses.planId, planId), isNull(businesses.deletedAt)));
  if (onPlan.length === 0) return [];

  // Two reads rather than a join: a business holds one counter row per 30 days, so the
  // set behind `inArray` is a handful of rows per business and matching cycles in Node
  // keeps the key derivation in `cycleOf` instead of duplicating it in SQL.
  const usageRows = await db
    .select()
    .from(quotaUsage)
    .where(inArray(quotaUsage.businessId, onPlan.map((b) => b.id)));

  const usageByBusiness = new Map<string, typeof usageRows>();
  for (const row of usageRows) {
    const list = usageByBusiness.get(row.businessId);
    if (list) list.push(row);
    else usageByBusiness.set(row.businessId, [row]);
  }

  return onPlan.map((b) => {
    const cycle = cycleOf(b.planStartedAt ?? b.createdAt ?? now, now);
    const usage = usageByBusiness.get(b.id)?.find((u) => u.period === cycle.period);
    return {
      businessId: b.id,
      period: cycle.period,
      resetsAt: cycle.resetsAt,
      messagesUsed: usage?.messagesUsed ?? 0,
      commentsUsed: usage?.commentsUsed ?? 0,
    };
  });
}

/**
 * Which notice, if any, this number earns. The threshold only: which budget earned it is
 * carried by `noticeKind`, and the two together are the row's uniqueness key. Kept separate
 * from the write so the operator's console can say how many businesses an edit just crossed
 * before it writes anything.
 */
export function crossedThreshold(used: number, limit: number): QuotaThreshold | null {
  return used >= limit ? 'quota_100' : used * 5 >= limit * 4 ? 'quota_80' : null;
}

/**
 * The stored kind, per budget. `quota_100` alone would make one business ring its bell
 * once per cycle and then go silent about the other allowance running out.
 */
function noticeKind(kind: QuotaKind, crossed: QuotaThreshold): `${QuotaKind}_${QuotaThreshold}` {
  return `${kind}_${crossed}`;
}

/**
 * The merchant's sentence. Server-side, with the number and the reset date already in it,
 * because a notification the merchant reads months later must still make sense without
 * any live plan or counter behind it.
 */
function noticeCopy(
  kind: QuotaKind,
  crossed: QuotaThreshold,
  used: number,
  limit: number,
  resetsAt: string,
): { title: string; body: string } {
  const unit = kind === 'message' ? 'messenger replies' : 'comment replies';
  return crossed === 'quota_100'
    ? {
        title: `Your ${unit} are used up`,
        body: `The agent has stopped replying to ${unit} for this cycle. Your allowance resets on ${resetsAt}, or move to a bigger plan in Billing.`,
      }
    : {
        title: `You have used 80% of your ${unit}`,
        body: `${used} of ${limit} ${unit} used this cycle. Your allowance resets on ${resetsAt}.`,
      };
}

/**
 * One notice per (business, kind, cycle), enforced by the unique index rather than by a
 * read-then-write. Called after a spend reports its new total, and again from the gate on
 * an already-exhausted budget — which is what makes a notice a crashed writer lost come
 * back on the next inbound message with no cron anywhere.
 */
export async function ensureQuotaNotice(
  businessId: string,
  kind: QuotaKind,
  period: string,
  used: number,
  limit: number,
  resetsAt: string,
): Promise<void> {
  const crossed = crossedThreshold(used, limit);
  if (!crossed) return;

  await db
    .insert(notifications)
    .values({
      businessId,
      kind: noticeKind(kind, crossed),
      period,
      ...noticeCopy(kind, crossed, used, limit, resetsAt),
      link: `/b/${businessId}/billing`,
    })
    .onConflictDoNothing();
}

/**
 * The same notice for every business on a plan, in one statement.
 *
 * Used when an operator tightens a cap: the businesses that just fell over the new line
 * have not spent anything, so no spend path will ever tell them, and there is no cron to
 * do it later. Returns how many rows actually landed — the unique index decides, so a
 * re-run of the same edit says 0 rather than spamming the bell.
 */
export async function ensurePlanNotices(
  planId: string,
  caps: { kind: QuotaKind; limit: number }[],
  now: Date = new Date(),
): Promise<number> {
  if (caps.length === 0) return 0;

  const values: (typeof notifications.$inferInsert)[] = [];
  for (const row of await cycleUsageOnPlan(planId, now)) {
    for (const cap of caps) {
      const used = cap.kind === 'message' ? row.messagesUsed : row.commentsUsed;
      const crossed = crossedThreshold(used, cap.limit);
      if (!crossed) continue;
      values.push({
        businessId: row.businessId,
        kind: noticeKind(cap.kind, crossed),
        period: row.period,
        ...noticeCopy(cap.kind, crossed, used, cap.limit, row.resetsAt),
        link: `/b/${row.businessId}/billing`,
      });
    }
  }
  if (values.length === 0) return 0;

  const inserted = await db
    .insert(notifications)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
}

export type SpendResult = {
  /** False means the cap was already reached and nothing was counted. */
  spent: boolean;
  period: string;
  limit: number | null;
  /** The new total when `spent`; null when refused, because the statement returned no row. */
  used: number | null;
};

function firstRow(result: unknown): Record<string, number> | null {
  const rows = (result as { rows?: unknown } | null)?.rows ?? result;
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, number>) : null;
}

/**
 * Buy one unit of budget, or find out there is none left.
 *
 * The INSERT branch needs its own guard: with no row yet for this cycle there is no
 * conflict, so a plan capped at 0 would otherwise insert a first reply anyway. Both
 * branches compare against the same bound limit, and the caller treats "zero rows" as
 * "refused" — that is the whole enforcement, and it holds even when N runs arrive at the
 * cap in the same instant.
 */
export async function spendQuotaUnit(
  businessId: string,
  kind: QuotaKind,
  now: Date = new Date(),
): Promise<SpendResult> {
  const resolved = await resolvePlan(businessId, now);
  if (!resolved) {
    // No business row to charge. Send it — a missing counter must not mute the agent.
    return { spent: true, period: now.toISOString().slice(0, 10), limit: null, used: null };
  }

  const limit = kind === 'message' ? resolved.messageLimit : resolved.commentLimit;
  const column = sql.identifier(COUNTER_COLUMN[kind]);
  const period = resolved.cycle.period;

  const result = await db.execute(sql`
    INSERT INTO "quota_usage" (id, business_id, period, messages_used, comments_used, updated_at)
    SELECT gen_random_uuid(), ${businessId}::uuid, ${period},
           ${kind === 'message' ? 1 : 0}, ${kind === 'comment' ? 1 : 0}, now()
    WHERE ${limit}::int IS NULL OR ${limit}::int > 0
    ON CONFLICT (business_id, period) DO UPDATE SET
      ${column} = quota_usage.${column} + EXCLUDED.${column},
      updated_at = now()
    WHERE ${limit}::int IS NULL OR quota_usage.${column} < ${limit}::int
    RETURNING ${column} as used
  `);

  const row = firstRow(result);
  if (!row) return { spent: false, period, limit, used: null };

  const used = Number(row.used);
  if (limit !== null) {
    await ensureQuotaNotice(businessId, kind, period, used, limit, resolved.cycle.resetsAt);
  }
  return { spent: true, period, limit, used };
}

/**
 * Give a unit back when the Graph POST failed after we bought it. The notice that already
 * fired stays: retracting a message the merchant may have read would be worse than a
 * budget one reply short, and neither can grant a second reply.
 */
export async function refundQuotaUnit(businessId: string, kind: QuotaKind, period: string): Promise<void> {
  const column = sql.identifier(COUNTER_COLUMN[kind]);
  await db.execute(sql`
    UPDATE "quota_usage"
    SET ${column} = GREATEST(${column} - 1, 0), updated_at = now()
    WHERE business_id = ${businessId}::uuid AND period = ${period}
  `);
}

/** The bell on the dashboard. Newest first, and nothing here writes. */
export async function listNotifications(businessId: string, limit = 50): Promise<NotificationItem[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.businessId, businessId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    period: row.period,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnreadNotifications(businessId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.businessId, businessId), isNull(notifications.readAt)))
    .limit(1);
  return row?.count ?? 0;
}

/**
 * `all` clears the bell; `ids` marks the rows the page actually showed. Returns how many
 * changed so the endpoint can answer with a number instead of leaving the dot to guess.
 */
export async function markNotificationsRead(
  businessId: string,
  opts: { ids?: string[]; all?: boolean },
): Promise<number> {
  const scope =
    opts.all || !opts.ids || opts.ids.length === 0
      ? and(eq(notifications.businessId, businessId), isNull(notifications.readAt))
      : and(eq(notifications.businessId, businessId), inArray(notifications.id, opts.ids));

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(scope)
    .returning({ id: notifications.id });

  return updated.length;
}
