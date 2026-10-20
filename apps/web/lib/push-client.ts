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

function firebaseApp() {
  return getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig);
}

/** Registers the FCM worker (config rides the query string) and waits until it is active. */
export async function ensurePushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !firebaseConfig.apiKey) {
    return null;
  }
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
  await navigator.serviceWorker.ready;
  return registration;
}

let foregroundBound = false;

/**
 * Shows a foreground push as a real notification. FCM delivers to the focused tab instead of
 * the worker whenever a visible client exists, so every page that can be focused has to listen —
 * without this, a push that arrives while the merchant is reading the inbox is simply dropped.
 */
export function bindForegroundMessages(registration: ServiceWorkerRegistration): void {
  if (foregroundBound) return;
  foregroundBound = true;
  const messaging = getMessaging(firebaseApp());
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

/**
 * Called by any page under the dashboard: when the browser already allowed notifications, the
 * listener is bound silently. Greeting is never asked here; the dashboard prompt owns that.
 */
export async function listenForPushMessages(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const registration = await ensurePushWorker();
    if (registration) bindForegroundMessages(registration);
  } catch (err) {
    console.warn('[push] foreground listener could not start:', err);
  }
}

/**
 * Asks the browser for notification permission, registers the FCM worker, turns the registration
 * into a token, and hands that token to the API for this business.
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

  const registration = await ensurePushWorker();
  if (!registration) throw new Error('Could not register the notification worker.');

  const token = await getToken(getMessaging(firebaseApp()), {
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

  bindForegroundMessages(registration);

  return 'granted';
}
