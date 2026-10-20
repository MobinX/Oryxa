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

export type PushSendResult = {
  /** Registrations found for the business. */
  tokens: number;
  sent: number;
  failed: number;
  removed: number;
  /** Why nothing was attempted, when nothing was. */
  skipped?: 'no-tokens' | 'not-configured';
  /** The first failure's FCM code, for the test button to explain a silent failure. */
  firstError?: string;
};

/**
 * Sends one data-only FCM message to every browser registered for the business. The service
 * worker owns how the alert looks and where a click lands, which data-only messages allow and
 * notification payloads do not. Dead registrations are forgotten as FCM reports them.
 */
export async function sendPushToBusiness(notice: NotificationPush): Promise<PushSendResult> {
  const tokens = await listPushTokens(notice.businessId);
  if (tokens.length === 0) return { tokens: 0, sent: 0, failed: 0, removed: 0, skipped: 'no-tokens' };

  const app = getAdminApp();
  if (!app) {
    console.warn('[push] Firebase Admin is not configured; notice stored without a push');
    return { tokens: tokens.length, sent: 0, failed: 0, removed: 0, skipped: 'not-configured' };
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
    let firstError: string | undefined;
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code ?? 'unknown';
      firstError ??= code;
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
    return {
      tokens: tokens.length,
      sent: result.successCount,
      failed: result.failureCount,
      removed: gone.length,
      ...(firstError ? { firstError } : {}),
    };
  } catch (err) {
    console.error('[push] FCM send failed:', err);
    return {
      tokens: tokens.length,
      sent: 0,
      failed: tokens.length,
      removed: 0,
      firstError: err instanceof Error ? err.message.slice(0, 200) : 'send failed',
    };
  }
}
