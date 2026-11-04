import { sendMessage, isFacebookSendError } from '@repo/integrations/facebook';
import type { MessengerDelivery, NotificationPush } from '@repo/db/crud/notification';
import { listMessengerNotificationRecipients } from '@repo/db/crud/messenger-notification';

/**
 * Sends the same notice the merchants see in the app to every Messenger account that redeemed
 * their notification code. Each account is messaged through the page it subscribed on, and one
 * refused send never stops the others. The notice's own link rides along as an absolute URL, so
 * a tap in Messenger opens that order, billing page, or conversation.
 *
 * It returns what happened instead of nothing. Notices are stored whether or not Messenger
 * accepts them, so a refused send used to be invisible: the merchant had no way to tell "the
 * agent never told you" from "you never linked a Messenger account".
 */
export async function sendNoticeToMessenger(notice: NotificationPush): Promise<MessengerDelivery> {
  const recipients = await listMessengerNotificationRecipients(notice.businessId);
  if (recipients.length === 0) {
    return {
      status: 'no_recipients',
      recipients: 0,
      delivered: 0,
      detail:
        'No Messenger account is following this store’s notification code yet, so there was '
        + 'nobody to message. Open Integrations → Messenger notifications, share the code, and '
        + 'send it to the page from the phone that should receive alerts.',
    };
  }

  // The app's root comes from the deployment's WEB_URL; the notice link is always app-relative.
  const root = process.env.WEB_URL?.trim().replace(/\/+$/, '');
  const link = notice.link
    ? root
      ? `${root}${notice.link.startsWith('/') ? '' : '/'}${notice.link}`
      : notice.link
    : null;

  const text = [notice.title, notice.body, link].filter(Boolean).join('\n');

  // HUMAN_AGENT, not RESPONSE: a RESPONSE is a reply, and Meta only delivers one for 24 hours
  // after that person last messaged the page — so an alert about an order placed last week could
  // never reach a merchant who had not messaged the page that day. The tag widens the window and
  // is allowed here because this is a notice for a human, not an automated customer answer.
  const results = await Promise.all(
    recipients.map((recipient) =>
      sendMessage(recipient.channelApiToken, recipient.platformUserId, text, { humanAgent: true })
        .then(() => null)
        .catch((err) => {
          console.error(
            `[messenger-notify] ${notice.businessId}: could not message ${recipient.platformUserId.slice(0, 6)}…`,
            err,
          );
          return isFacebookSendError(err)
            ? err.userMessage.replace("the customer's", 'your')
            : err instanceof Error
              ? err.message
              : 'the send failed';
        }),
    ),
  );

  const failures = results.filter((r): r is string => r !== null);
  const delivered = recipients.length - failures.length;
  return {
    status: delivered === 0 ? 'failed' : failures.length > 0 ? 'partial' : 'delivered',
    recipients: recipients.length,
    delivered,
    detail: failures.length > 0
      ? `${failures.length} of ${recipients.length} account(s): ${failures[0]!.slice(0, 280)}`
      : null,
  };
}
