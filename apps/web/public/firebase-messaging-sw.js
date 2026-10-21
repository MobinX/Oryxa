/* eslint-disable no-undef */
/**
 * FCM background worker. The client registers this file with the Firebase web config in the
 * query string, so the config never has to be baked into a static asset. Messages are data-only:
 * this worker draws the alert and owns the click target.
 */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey') || undefined,
  authDomain: params.get('authDomain') || undefined,
  projectId: params.get('projectId') || undefined,
  storageBucket: params.get('storageBucket') || undefined,
  messagingSenderId: params.get('messagingSenderId') || undefined,
  appId: params.get('appId') || undefined,
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  if (!data.title) return;
  self.registration.showNotification(data.title, {
    body: data.body || '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    data: { link: data.link || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            client.navigate(new URL(link, self.location.origin).href).catch(() => {});
            return client.focus();
          }
        }
        return clients.openWindow(link);
      }),
  );
});
