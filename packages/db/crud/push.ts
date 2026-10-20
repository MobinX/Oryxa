import { eq, inArray } from 'drizzle-orm';
import { db } from '@db/client';
import { pushTokens } from '@db/schema';

/** Remembers this browser for this business's push notices; one token may serve several stores. */
export async function registerPushToken(businessId: string, token: string): Promise<void> {
  await db.insert(pushTokens).values({ businessId, token }).onConflictDoNothing();
}

export async function listPushTokens(businessId: string): Promise<string[]> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.businessId, businessId));
  return rows.map((row) => row.token);
}

/** FCM said these are gone (uninstalled, cleared, expired) — forget them so sends stay cheap. */
export async function deletePushTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
}
