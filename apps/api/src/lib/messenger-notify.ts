import { sendMessage } from '@repo/integrations/facebook';
import type { NotificationPush } from '@repo/db/crud/notification';
import { listMessengerNotificationRecipients } from '@repo/db/crud/messenger-notification';

/**
 * Sends the same notice the merchants see in the app to every Messenger account that redeemed
 * their notification code. Each account is messaged through the page it subscribed on, and one
 * refused send never stops the others. The notice's own link rides along as an absolute URL, so
 * a tap in Messenger opens that order, billing page, or conversation.
 */
export async function sendNoticeToMessenger(notice: NotificationPush): Promise<void> {
  const recipients = await listMessengerNotificationRecipients(notice.businessId);
  if (recipients.length === 0) return;

  // The app's root comes from the deployment's WEB_URL; the notice link is always app-relative.
  const root = process.env.WEB_URL?.trim().replace(/\/+$/, '');
  const link = notice.link
    ? root
      ? `${root}${notice.link.startsWith('/') ? '' : '/'}${notice.link}`
      : notice.link
    : null;

  const text = [notice.title, notice.body, link].filter(Boolean).join('\n');

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
