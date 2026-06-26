import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses } from '@db/schema';
import { createBusinessInputSchema, updateBusinessInputSchema } from '@repo/shared';

export async function createBusiness(userId: string, input: unknown) {
  const parsed = createBusinessInputSchema.parse(input);
  const [business] = await db
    .insert(businesses)
    .values({ ...parsed, userId })
    .returning();
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
