import { eq } from 'drizzle-orm';
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
    where: eq(businesses.id, id),
  });
}

export async function updateBusiness(id: string, userId: string, input: unknown) {
  const parsed = updateBusinessInputSchema.parse(input);
  const business = await getBusinessById(id);
  if (!business || business.userId !== userId) return null;

  await db.update(businesses).set(parsed).where(eq(businesses.id, id));
  return { success: true };
}

export async function verifyBusinessOwnership(businessId: string, userId: string) {
  const business = await getBusinessById(businessId);
  return business?.userId === userId;
}
