import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { db } from '@db/client';
import { users } from '@db/schema';
import { syncUserInputSchema, type z } from '@repo/shared';

export async function syncUser(input: z.infer<typeof syncUserInputSchema>) {
  const parsed = syncUserInputSchema.parse(input);

  const existing = await db.query.users.findFirst({
    where: eq(users.firebaseUid, parsed.firebaseUid),
  });

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        name: parsed.name,
        email: parsed.email ?? existing.email,
        signInMethod: parsed.signInMethod,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      firebaseUid: parsed.firebaseUid,
      name: parsed.name,
      email: parsed.email,
      signInMethod: parsed.signInMethod,
    })
    .returning();

  return created;
}

export async function getUserByFirebaseUid(firebaseUid: string) {
  return db.query.users.findFirst({
    where: eq(users.firebaseUid, firebaseUid),
  });
}

export async function getUserById(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}
