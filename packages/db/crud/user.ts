import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { users } from '@db/schema';
import { syncUserInputSchema, updateUserInputSchema, type z } from '@repo/shared';

export async function syncUser(input: z.infer<typeof syncUserInputSchema>) {
  const parsed = syncUserInputSchema.parse(input);

  const existing = await db.query.users.findFirst({
    where: and(eq(users.firebaseUid, parsed.firebaseUid), isNull(users.deletedAt)),
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
    where: and(eq(users.firebaseUid, firebaseUid), isNull(users.deletedAt)),
  });
}

export async function getUserById(id: string) {
  return db.query.users.findFirst({
    where: and(eq(users.id, id), isNull(users.deletedAt)),
  });
}

export async function updateUser(id: string, input: unknown) {
  const parsed = updateUserInputSchema.parse(input);
  const [updated] = await db
    .update(users)
    .set(parsed)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function deleteUser(id: string) {
  const [updated] = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning();
  return updated ? { deleted: true } : null;
}

// Internal helpers (not exported through @repo/shared) — used by test cleanup
export async function hardDeleteUser(id: string) {
  await db.delete(users).where(eq(users.id, id));
}
