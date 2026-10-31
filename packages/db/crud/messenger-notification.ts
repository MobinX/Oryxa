import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, channels, messengerNotificationUsers, messengerNotifications } from '@db/schema';
import { decryptChannelToken } from '@repo/db/crud/channel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The business's notification code, created on first ask; one row per business, never rotated. */
export async function ensureMessengerNotification(businessId: string): Promise<string> {
  const existing = await db.query.messengerNotifications.findFirst({
    where: eq(messengerNotifications.businessId, businessId),
  });
  if (existing) return existing.token;

  await db.insert(messengerNotifications).values({ businessId }).onConflictDoNothing();
  const [row] = await db
    .select({ token: messengerNotifications.token })
    .from(messengerNotifications)
    .where(eq(messengerNotifications.businessId, businessId));
  if (!row) throw new Error('Could not create the notification code');
  return row.token;
}

/** What the merchant's notification portal shows: the code (once created) and who follows it. */
export async function getMessengerNotificationOverview(businessId: string) {
  const [codeRow] = await db
    .select({ token: messengerNotifications.token })
    .from(messengerNotifications)
    .where(eq(messengerNotifications.businessId, businessId));

  const users = await db
    .select({
      id: messengerNotificationUsers.id,
      name: messengerNotificationUsers.name,
      platformUserId: messengerNotificationUsers.platformUserId,
      createdAt: messengerNotificationUsers.createdAt,
    })
    .from(messengerNotificationUsers)
    .where(eq(messengerNotificationUsers.businessId, businessId))
    .orderBy(asc(messengerNotificationUsers.createdAt));

  return { code: codeRow?.token ?? null, users };
}

/** The business a code belongs to, with its name for the confirmation message. */
export async function findBusinessByNotificationToken(token: string) {
  if (!UUID.test(token)) return null;
  return db.query.messengerNotifications.findFirst({
    where: eq(messengerNotifications.token, token),
    with: { business: { columns: { id: true, name: true } } },
  });
}

/** Binds one Messenger account to a business; a second code from the same account refreshes it. */
export async function upsertMessengerNotificationUser(input: {
  businessId: string;
  channelId: string;
  platformUserId: string;
  name?: string | null;
}): Promise<void> {
  await db
    .insert(messengerNotificationUsers)
    .values({
      businessId: input.businessId,
      channelId: input.channelId,
      platformUserId: input.platformUserId,
      name: input.name ?? null,
    })
    .onConflictDoUpdate({
      target: [messengerNotificationUsers.businessId, messengerNotificationUsers.platformUserId],
      set: { channelId: input.channelId, name: input.name ?? null },
    });
}

/** Every Messenger account following this business, with the page token allowed to message it. */
export async function listMessengerNotificationRecipients(businessId: string) {
  const rows = await db
    .select({
      platformUserId: messengerNotificationUsers.platformUserId,
      channelApiToken: channels.apiToken,
    })
    .from(messengerNotificationUsers)
    .innerJoin(channels, eq(channels.id, messengerNotificationUsers.channelId))
    .where(
      and(eq(messengerNotificationUsers.businessId, businessId), isNull(channels.deletedAt)),
    );
  return rows.map((row) => ({ ...row, channelApiToken: decryptChannelToken(row.channelApiToken) }));
}

/** Unlinks one account; scoped to the business, so an id from another store matches nothing. */
export async function removeMessengerNotificationUser(
  businessId: string,
  userId: string,
): Promise<boolean> {
  const removed = await db
    .delete(messengerNotificationUsers)
    .where(
      and(
        eq(messengerNotificationUsers.id, userId),
        eq(messengerNotificationUsers.businessId, businessId),
      ),
    )
    .returning({ id: messengerNotificationUsers.id });
  return removed.length > 0;
}

/** True when this Messenger account is already linked to a business through this page. */
export async function isMessengerNotificationUser(
  channelId: string,
  platformUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: messengerNotificationUsers.id })
    .from(messengerNotificationUsers)
    .where(
      and(
        eq(messengerNotificationUsers.channelId, channelId),
        eq(messengerNotificationUsers.platformUserId, platformUserId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * A connected notification account sends ON or OFF: flip the agent switch on every business
 * it follows through this page. Returns the affected ids so the webhook can tell a command
 * from ordinary chatter (empty means the sender is not a notification account here).
 */
export async function setAgentStateForNotificationUser(
  channelId: string,
  platformUserId: string,
  agentState: boolean,
): Promise<string[]> {
  const rows = await db
    .select({ businessId: messengerNotificationUsers.businessId })
    .from(messengerNotificationUsers)
    .where(
      and(
        eq(messengerNotificationUsers.channelId, channelId),
        eq(messengerNotificationUsers.platformUserId, platformUserId),
      ),
    );
  const businessIds = [...new Set(rows.map((row) => row.businessId))];
  if (businessIds.length === 0) return [];

  await db
    .update(businesses)
    .set({ agentState })
    .where(inArray(businesses.id, businessIds));
  return businessIds;
}
