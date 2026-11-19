'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';
import { firebaseConfig } from '@/lib/firebase';
import { bindForegroundMessages, ensurePushWorker } from '@/lib/push-client';

export type MailPushResult = 'granted' | 'denied' | 'unsupported';

function firebaseApp() {
  return getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
}

async function registrationToken(): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!firebaseConfig.apiKey) return null;
  if (!vapidKey) {
    // The business push client already fails loudly here; the mail one should too.
    throw new Error('Web push is not configured (missing NEXT_PUBLIC_FIREBASE_VAPID_KEY).');
  }
  const registration = await ensurePushWorker();
  if (!registration) return null;
  const token = await getToken(getMessaging(firebaseApp()), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}

async function subscribe(token: string): Promise<boolean> {
  const response = await fetch('/api/push/mail/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      platform: 'web',
      device_label: typeof navigator === 'undefined' ? undefined : navigator.userAgent.slice(0, 300),
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'This browser could not be registered for mail alerts.');
  }
  return true;
}

async function bind(registration: ServiceWorkerRegistration | null): Promise<void> {
  if (registration) bindForegroundMessages(registration);
}

/**
 * Requests notification permission and registers this browser for the signed-in admin's
 * inbox. Called from the sign-in form (a real user gesture) and from the mailbox prompt.
 */
export async function enableMailPush(): Promise<MailPushResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (!firebaseConfig.apiKey) return 'unsupported';

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const token = await registrationToken();
  if (!token) throw new Error('This browser could not obtain a push token.');
  await subscribe(token);
  await bind(await ensurePushWorker());
  return 'granted';
}

/** Silent renewal when the browser already allowed notifications. */
export async function syncMailPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const token = await registrationToken();
  if (!token) return false;
  await subscribe(token);
  await bind(await ensurePushWorker());
  return true;
}

export async function heartbeatMailPush(): Promise<void> {
  const token = await registrationToken().catch(() => null);
  await fetch('/api/push/mail/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { token } : {}),
  }).catch(() => {});
}

export async function mailPushStatus(): Promise<{
  subscribed: boolean;
  count: number;
  permission: NotificationPermission | 'unsupported';
}> {
  const permission =
    typeof window === 'undefined' || !('Notification' in window)
      ? ('unsupported' as const)
      : Notification.permission;
  try {
    const response = await fetch('/api/push/mail/status', { cache: 'no-store' });
    if (!response.ok) return { subscribed: false, count: 0, permission };
    const body = (await response.json()) as { subscribed?: boolean; count?: number };
    return { subscribed: Boolean(body.subscribed), count: Number(body.count || 0), permission };
  } catch {
    return { subscribed: false, count: 0, permission };
  }
}

/** Turns alerts off for this browser without deleting the shared FCM registration. */
export async function disableMailPush(): Promise<void> {
  const token = await registrationToken().catch(() => null);
  await fetch('/api/push/mail/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { token } : {}),
  }).catch(() => {});
}

export type TestPushResult = {
  configured: boolean;
  subscriptions: number;
  sent: number;
  failed: number;
  errorCode: string | null;
};

/** Sends one test alert to this session's devices so the admin can see the path works. */
export async function sendTestMailPush(): Promise<TestPushResult> {
  const response = await fetch('/api/push/mail/test', { method: 'POST', cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as Partial<TestPushResult> & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || 'The test alert could not be sent.');
  return {
    configured: Boolean(body.configured),
    subscriptions: Number(body.subscriptions || 0),
    sent: Number(body.sent || 0),
    failed: Number(body.failed || 0),
    errorCode: body.errorCode ?? null,
  };
}
