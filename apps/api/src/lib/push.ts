import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { NotificationPush } from '@repo/db/crud/notification';
import { deletePushTokens, listPushTokens } from '@repo/db/crud/push';

let adminApp: App | null | undefined;

/** The same service account the auth middleware uses; whichever initializes first is reused. */
function getAdminApp(): App | null {
  if (getApps().length > 0) return getApps()[0]!;
  if (adminApp !== undefined) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    adminApp = null;
    return null;
  }

  adminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
  });
  return adminApp;
}

/**
 * Sends one data-only FCM message to every browser registered for the business. The service
 * worker owns how the alert looks and where a click lands, which data-only messages allow and
 * notification payloads do not. Dead registrations are forgotten as FCM reports them.
 */
export async function sendPushToBusiness(notice: NotificationPush): Promise<void> {
  const tokens = await listPushTokens(notice.businessId);
  if (tokens.length === 0) return;

  const app = getAdminApp();
  if (!app) {
    console.warn('[push] Firebase Admin is not configured; notice stored without a push');
    return;
  }

  try {
    const result = await getMessaging(app).sendEachForMulticast({
      tokens,
      data: {
        title: notice.title,
        body: notice.body,
        ...(notice.link ? { link: notice.link } : {}),
      },
      webpush: { headers: { Urgency: 'high' } },
    });

    const gone: string[] = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument'
      ) {
        gone.push(tokens[index]);
      }
    });
    if (gone.length > 0) await deletePushTokens(gone);

    console.log(
      `[push] ${notice.businessId}: ${result.successCount} sent, ${result.failureCount} failed, ${gone.length} forgotten`,
    );
  } catch (err) {
    console.error('[push] FCM send failed:', err);
  }
}
