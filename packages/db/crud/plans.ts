import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, planAssignments, plans, quotaUsage } from '@db/schema';
import type {
  AdminBusinessPlan,
  AdminPlanRow,
  CreatePlanInput,
  Plan,
  PlanActorKind,
  PlanAssignment,
  PublicPlan,
  UpdatePlanInput,
} from '@repo/shared';
import { cycleOf } from './billing';

/**
 * The operator's plan catalogue and the assignment pointer on each business.
 *
 * Nothing here copies a limit onto a business: businesses.plan_id points at a row and the
 * gate reads the limits from that row every time, which is what makes editing a plan a
 * fleet-wide change that needs no job and no cache flush.
 */

type PlanRow = typeof plans.$inferSelect;

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    priceCents: row.priceCents,
    currency: row.currency,
    messageLimit: row.messageLimit,
    commentLimit: row.commentLimit,
    features: row.features ?? [],
    position: row.position,
    active: row.active,
  };
}

/**
 * One allowance, in words, computed here so no client re-implements the NULL rule.
 * "Uncapped", "No replies" and "1,000 replies" are three different answers and the
 * difference between the first two is the whole point of the column.
 */
function plural(unit: string, count: number): string {
  if (count === 1) return unit;
  return unit.endsWith('y') ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}

export function limitLabel(limit: number | null, unit: string): string {
  if (limit === null) return 'Uncapped';
  const words = plural(unit, limit);
  return limit === 0 ? `No ${words}` : `${limit.toLocaleString('en-US')} ${words}`;
}

export function priceLabel(priceCents: number, currency: string): string {
  if (priceCents === 0) return 'Free';
  const amount = priceCents % 100 === 0 ? String(priceCents / 100) : (priceCents / 100).toFixed(2);
  return `${currency === 'USD' ? '$' : `${currency} `}${amount}`;
}

function toPublicPlan(row: PlanRow): PublicPlan {
  return {
    name: row.name,
    slug: row.slug,
    priceCents: row.priceCents,
    currency: row.currency,
    priceLabel: priceLabel(row.priceCents, row.currency),
    messageLimitLabel: limitLabel(row.messageLimit, 'messenger reply'),
    commentLimitLabel: limitLabel(row.commentLimit, 'comment reply'),
    features: row.features ?? [],
  };
}

/** The offers a stranger may see on /pricing — active, never deleted, and no assignable ids. */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.active, true), isNull(plans.deletedAt)))
    .orderBy(asc(plans.position), asc(plans.name));
  return rows.map(toPublicPlan);
}

/**
 * The plans a merchant may choose right now, with their ids.
 *
 * /pricing shows the label-only view; a picker needs the uuid to send back, so this is
 * the same filter with the row that makes it assignable. Retired plans are excluded —
 * only an operator may still put a business on one.
 */
export async function listActivePlans(): Promise<Plan[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.active, true), isNull(plans.deletedAt)))
    .orderBy(asc(plans.position), asc(plans.name));
  return rows.map(toPlan);
}

/** Everything an admin sees, including retired plans and how many businesses each one holds. */
export async function listAdminPlans(): Promise<AdminPlanRow[]> {
  const [planRows, counts] = await Promise.all([
    db.select().from(plans).where(isNull(plans.deletedAt)).orderBy(asc(plans.position), asc(plans.name)),
    db
      .select({
        planId: businesses.planId,
        count: sql<number>`count(*)::int`,
      })
      .from(businesses)
      .where(and(isNull(businesses.deletedAt), sql`${businesses.planId} is not null`))
      .groupBy(businesses.planId),
  ]);

  const byPlan = new Map(counts.map((c) => [c.planId as string, c.count]));
  return planRows.map((row) => ({ ...toPlan(row), businessCount: byPlan.get(row.id) ?? 0 }));
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
    .limit(1);
  return row ? toPlan(row) : null;
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.slug, slug), isNull(plans.deletedAt)))
    .limit(1);
  return row ? toPlan(row) : null;
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const [row] = await db.insert(plans).values(input).returning();
  return toPlan(row);
}

export async function updatePlan(id: string, input: UpdatePlanInput): Promise<Plan | null> {
  const [row] = await db
    .update(plans)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
    .returning();
  return row ? toPlan(row) : null;
}

/**
 * Soft delete, refused while anyone is still on the plan.
 *
 * Deleting a plan that businesses point at would set their plan_id to NULL through the
 * ON DELETE SET NULL, and NULL means unlimited — so deletion would silently grant
 * allowance to everyone who was paying for it. Retire with active=false instead.
 */
export async function deletePlan(
  id: string,
): Promise<{ deleted: true } | { conflict: true; businesses: { id: string; name: string }[] }> {
  const live = await db
    .select({ id: businesses.id, name: businesses.name })
    .from(businesses)
    .where(and(eq(businesses.planId, id), isNull(businesses.deletedAt)));

  if (live.length > 0) return { conflict: true, businesses: live };

  await db.update(plans).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(plans.id, id));
  return { deleted: true };
}

export type AssignInput = {
  actorKind: PlanActorKind;
  /** Nullable on purpose: an operator action taken by the system (a backfill) has no user. */
  actorUserId?: string | null;
};

/**
 * Point a business at a plan, or at nothing.
 *
 * Two statements, because the HTTP driver cannot transact: the pointer moves first and the
 * audit row follows. The worst a crash between them can do is lose one history row about a
 * change that did happen — it cannot hand out or withhold a reply.
 *
 * The anchor is set only when it is missing. Moving it on every switch would let a merchant
 * zero their own counter by changing plans, and with self-serve upgrades and no payment
 * rail that is free replies.
 */
export async function assignPlan(
  businessId: string,
  planId: string | null,
  input: AssignInput,
): Promise<{ previousPlanId: string | null } | null> {
  const [before] = await db
    .select({ planId: businesses.planId, planStartedAt: businesses.planStartedAt })
    .from(businesses)
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
    .limit(1);
  if (!before) return null;

  await db
    .update(businesses)
    .set({ planId, planStartedAt: before.planStartedAt ?? new Date() })
    .where(eq(businesses.id, businessId));

  await db.insert(planAssignments).values({
    businessId,
    planId,
    previousPlanId: before.planId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId ?? null,
  });

  return { previousPlanId: before.planId };
}

/**
 * Start this business's cycle again from today, spending nothing.
 *
 * There is no "reset the counter" statement to write: the counters are keyed by the cycle
 * start date, so moving the anchor makes the current row history and the next spend opens
 * a fresh one. This is the operator's manual top-up, since no payment rail exists to buy
 * more mid-cycle.
 */
export async function resetCycle(businessId: string, input: AssignInput): Promise<boolean> {
  const [updated] = await db
    .update(businesses)
    .set({ planStartedAt: new Date() })
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
    .returning({ id: businesses.id, planId: businesses.planId });
  if (!updated) return false;

  // planId === previousPlanId is how this row reads as "granted a fresh cycle", not "put
  // onto a plan". Extra budget with no payment rail has to be traceable to an operator.
  await db.insert(planAssignments).values({
    businessId,
    planId: updated.planId,
    previousPlanId: updated.planId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId ?? null,
  });
  return true;
}

export async function listAssignments(businessId: string): Promise<PlanAssignment[]> {
  const [rows, planRows] = await Promise.all([
    db
      .select()
      .from(planAssignments)
      .where(eq(planAssignments.businessId, businessId))
      .orderBy(sql`${planAssignments.createdAt} desc`),
    db.select({ id: plans.id, name: plans.name }).from(plans),
  ]);

  // Names resolved in Node rather than two self-joins on `plans`: the catalogue is a
  // handful of rows, and an audit row must still read correctly after its plan is gone.
  const nameById = new Map(planRows.map((p) => [p.id, p.name]));

  return rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    planId: r.planId,
    planName: r.planId ? (nameById.get(r.planId) ?? null) : null,
    previousPlanId: r.previousPlanId,
    previousPlanName: r.previousPlanId ? (nameById.get(r.previousPlanId) ?? null) : null,
    actorKind: r.actorKind,
    actorUserId: r.actorUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * The operator's fleet view: every live business, its plan, and what it has used in the
 * cycle it is currently inside.
 *
 * Three small reads instead of one lateral join — businesses, plans and quota_usage are all
 * tiny by construction (one row per business per 30 days), so matching them in Node keeps
 * this file free of raw SQL and keeps each cycle's own key derivation in one place.
 */
export async function listAdminBusinessPlans(now: Date = new Date()): Promise<AdminBusinessPlan[]> {
  const floorKey = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const [businessRows, planRows, usageRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        planId: businesses.planId,
        planStartedAt: businesses.planStartedAt,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(isNull(businesses.deletedAt)),
    db.select().from(plans),
    db.select().from(quotaUsage).where(gte(quotaUsage.period, floorKey)),
  ]);

  const planById = new Map(planRows.map((p) => [p.id, p]));
  const usageByBusiness = new Map<string, typeof usageRows>();
  for (const row of usageRows) {
    const list = usageByBusiness.get(row.businessId);
    if (list) list.push(row);
    else usageByBusiness.set(row.businessId, [row]);
  }

  return businessRows
    .map((b) => {
      // A soft-deleted plan joins to nothing, and nothing means uncapped — same rule the
      // gate uses, so the console can never disagree with what the agent is enforcing.
      const joined = b.planId ? planById.get(b.planId) : undefined;
      const plan = joined && joined.deletedAt === null ? joined : undefined;
      const cycle = cycleOf(b.planStartedAt ?? b.createdAt ?? now, now);
      const usage = usageByBusiness.get(b.id)?.find((u) => u.period === cycle.period);

      return {
        businessId: b.id,
        businessName: b.name,
        planId: plan?.id ?? null,
        planName: plan?.name ?? null,
        planStartedAt: (b.planStartedAt ?? b.createdAt).toISOString(),
        period: cycle.period,
        messagesUsed: usage?.messagesUsed ?? 0,
        commentsUsed: usage?.commentsUsed ?? 0,
        messageLimit: plan?.messageLimit ?? null,
        commentLimit: plan?.commentLimit ?? null,
      };
    })
    .sort((a, b) => a.businessName.localeCompare(b.businessName));
}

/** How many live businesses are on each of these plans — the warning an edit needs first. */
export async function countBusinessesOnPlans(planIds: string[]): Promise<Map<string, number>> {
  if (planIds.length === 0) return new Map();
  const rows = await db
    .select({ planId: businesses.planId, count: sql<number>`count(*)::int` })
    .from(businesses)
    .where(and(inArray(businesses.planId, planIds), isNull(businesses.deletedAt)))
    .groupBy(businesses.planId);
  return new Map(rows.map((r) => [r.planId as string, r.count]));
}
