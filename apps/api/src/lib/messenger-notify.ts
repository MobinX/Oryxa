import { sendMessage } from '@repo/integrations/facebook';
import type { NotificationPush } from '@repo/db/crud/notification';
import { listMessengerNotificationRecipients } from '@repo/db/crud/messenger-notification';

/**
 * Sends the same notice the merchants see in the app to every Messenger account that redeemed
 * their notification code. Each account is messaged through the page it subscribed on, and one
 * refused send never stops the others.
 */
export async function sendNoticeToMessenger(notice: NotificationPush): Promise<void> {
  const recipients = await listMessengerNotificationRecipients(notice.businessId);
  if (recipients.length === 0) return;

  const text = `${notice.title}\n${notice.body}`;
  await Promise.all(
    recipients.map((recipient) =>
      sendMessage(recipient.channelApiToken, recipient.platformUserId, text).catch((err) => {
        console.error(
          `[messenger-notify] ${notice.businessId}: could not message ${recipient.platformUserId.slice(0, 6)}…`,
          err,
        );
      }),
    ),
  );
  console.log(`[messenger-notify] ${notice.businessId}: ${recipients.length} recipient(s) notified`);
}
