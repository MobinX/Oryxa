'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { enablePushNotifications } from '@/lib/push-client';

const dismissKey = (businessId: string) => `oryxa:push-dismissed:${businessId}`;

/**
 * The dashboard's one-time ask. A browser that already granted permission is renewed silently;
 * one that said no stays silent forever (the browser will not ask again anyway); everyone else
 * sees the alert until they enable or dismiss it for this business.
 */
export function PushNotificationPrompt({ businessId }: { businessId: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') {
      // A returning browser: refresh the token quietly, never prompt again.
      void enablePushNotifications(businessId).catch(() => {});
      return;
    }
    try {
      if (localStorage.getItem(dismissKey(businessId))) return;
    } catch {
      // Private mode with storage blocked: the ask still shows.
    }
    setVisible(true);
  }, [businessId]);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePushNotifications(businessId);
      if (result === 'granted') {
        setVisible(false);
      } else if (result === 'denied') {
        setVisible(false);
      } else {
        setError('This browser does not support notifications.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(businessId), '1');
    } catch {
      // Nothing to remember into; hiding for this page view is enough.
    }
    setVisible(false);
  };

  return (
    <Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Turn on notifications</p>
          <p className="text-sm text-muted-foreground">
            Get a browser alert when this business&apos;s agent allowance runs low
            {error ? ` — ${error}` : '.'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button type="button" variant="outline" size="sm" onClick={dismiss} disabled={busy}>
          Not now
        </Button>
        <Button type="button" size="sm" onClick={enable} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable notifications'}
        </Button>
      </div>
    </Card>
  );
}
