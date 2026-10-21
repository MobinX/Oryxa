'use client';

import { useEffect } from 'react';
import { listenForPushMessages } from '@/lib/push-client';

/**
 * Mounted once per business layout. FCM routes a push to the focused tab instead of the service
 * worker whenever one is visible, so the listener has to exist on every page the merchant can be
 * reading — not just the dashboard that asked for permission.
 */
export function PushMessageListener() {
  useEffect(() => {
    void listenForPushMessages();
  }, []);
  return null;
}
