import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { channels, messengerNotificationUsers, messengerNotifications } from '@db/schema';

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
  return db
    .select({
      platformUserId: messengerNotificationUsers.platformUserId,
      channelApiToken: channels.apiToken,
    })
    .from(messengerNotificationUsers)
    .innerJoin(channels, eq(channels.id, messengerNotificationUsers.channelId))
    .where(
      and(eq(messengerNotificationUsers.businessId, businessId), isNull(channels.deletedAt)),
    );
}
