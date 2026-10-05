import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses } from '@db/schema';
import { createBusinessInputSchema, updateBusinessInputSchema } from '@repo/shared';
import { assignPlan, getPlanBySlug } from '@repo/db/crud/plans';

/** The plan every new store starts on. Seeded by migration 0012. */
const DEFAULT_PLAN_SLUG = 'free';

export async function createBusiness(userId: string, input: unknown) {
  const parsed = createBusinessInputSchema.parse(input);
  const [business] = await db
    .insert(businesses)
    .values({ ...parsed, userId })
    .returning();

  // A signup must not be unlimited by accident: `plan_id IS NULL` means unlimited, so a
  // business created without a plan would get free replies forever. Two awaited
  // statements on the path that runs when somebody joins — not one per message. If the
  // seeded plan is missing or retired the business is left unassigned, which is what it
  // was before plans existed.
  const starter = await getPlanBySlug(DEFAULT_PLAN_SLUG);
  if (starter?.active) await assignPlan(business.id, starter.id, { actorKind: 'system' });

  return business;
}

export async function getBusinessById(id: string) {
  return db.query.businesses.findFirst({
    where: and(eq(businesses.id, id), isNull(businesses.deletedAt)),
  });
}

export async function updateBusiness(id: string, userId: string, input: unknown) {
  const parsed = updateBusinessInputSchema.parse(input);
  const business = await getBusinessById(id);
  if (!business || business.userId !== userId) return null;

  await db
    .update(businesses)
    .set(parsed)
    .where(eq(businesses.id, id));
  return { success: true };
}

export async function listBusinessesByUserId(userId: string) {
  return db.query.businesses.findMany({
    where: and(eq(businesses.userId, userId), isNull(businesses.deletedAt)),
    orderBy: [desc(businesses.createdAt)],
  });
}

export async function deleteBusiness(id: string, userId: string) {
  const business = await getBusinessById(id);
  if (!business || business.userId !== userId) return null;
  await db
    .update(businesses)
    .set({ deletedAt: new Date() })
    .where(eq(businesses.id, id));
  return { deleted: true };
}

export async function verifyBusinessOwnership(businessId: string, userId: string) {
  const business = await getBusinessById(businessId);
  return business?.userId === userId;
}

// Hard delete for test cleanup — removes the user row (cascade clears businesses)
export async function hardDeleteBusinessesForUser(userId: string) {
  await db.delete(businesses).where(eq(businesses.userId, userId));
}

/** Permanently deletes all data for a business. Irreversible. */
export async function hardDeleteBusiness(id: string, userId: string) {
  const business = await db.query.businesses.findFirst({
    where: and(eq(businesses.id, id), eq(businesses.userId, userId)),
  });
  if (!business) return null;
  await db.delete(businesses).where(and(eq(businesses.id, id), eq(businesses.userId, userId)));
  return { deleted: true };
}
