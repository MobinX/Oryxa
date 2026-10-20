'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { firebaseConfig } from '@/lib/firebase';

const SW_PATH = '/firebase-messaging-sw.js';
let foregroundBound = false;

/** The SW needs the web config; query params keep it out of a build-time interpolation. */
function serviceWorkerUrl(): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (value) params.set(key, value);
  }
  return `${SW_PATH}?${params.toString()}`;
}

export type PushEnableResult = 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser for notification permission, registers the FCM worker, turns the registration
 * into a token, and hands that token to the API for this business. Also binds foreground
 * messages to a notification so an open tab still shows the alert.
 */
export async function enablePushNotifications(businessId: string): Promise<PushEnableResult> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (!firebaseConfig.apiKey) return 'unsupported';

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error('Push notifications are not configured yet (missing web push key).');
  }

  const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
  await navigator.serviceWorker.ready;

  const app = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('This browser could not obtain a push token.');

  const res = await fetch(`/api/push/subscribe?businessId=${encodeURIComponent(businessId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error('This browser could not be registered for notifications.');

  if (!foregroundBound) {
    foregroundBound = true;
    onMessage(messaging, (payload) => {
      const data = payload.data ?? {};
      if (!data.title) return;
      void registration.showNotification(data.title, {
        body: data.body ?? '',
        icon: '/logo.svg',
        badge: '/logo.svg',
        data: { link: data.link ?? '/' },
      });
    });
  }

  return 'granted';
}
