import { db } from '@db/client';
import { notifications } from '@db/schema';

/** What a push needs: the stored notice's own words and where a click should land. */
export type NotificationPush = {
  businessId: string;
  title: string;
  body: string;
  link: string | null;
};

let notificationPushHandler: ((notice: NotificationPush) => Promise<void>) | null = null;

/**
 * The API registers the push sender when it boots: the database package must not depend on
 * firebase-admin, and the provider credentials belong to the app that sends.
 */
export function setNotificationPushHandler(
  handler: ((notice: NotificationPush) => Promise<void>) | null,
): void {
  notificationPushHandler = handler;
}

/** Best effort by design: a push that cannot go out must never undo the notice already stored. */
export function pushNotice(notice: NotificationPush): void {
  if (!notificationPushHandler) return;
  void notificationPushHandler(notice).catch((err) => {
    console.error('[notifications] push delivery failed:', err);
  });
}

/**
 * A merchant-facing notice that stands alone (an order landed, for example): stored, then pushed.
 * Quota notices keep their once-per-cycle insert in billing.ts and call `pushNotice` themselves.
 */
export async function createBusinessNotification(input: {
  businessId: string;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  period?: string | null;
}): Promise<void> {
  const inserted = await db
    .insert(notifications)
    .values({
      businessId: input.businessId,
      kind: input.kind,
      period: input.period ?? null,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  if (inserted.length === 0) return;
  pushNotice({
    businessId: input.businessId,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
  });
}
