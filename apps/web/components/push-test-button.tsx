'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enablePushNotifications } from '@/lib/push-client';

type TestResponse = {
  tokens: number;
  sent: number;
  failed: number;
  removed: number;
  skipped?: 'no-tokens' | 'not-configured';
  firstError?: string;
  error?: string;
};

/**
 * One click that proves the whole path: this browser registers (asking permission if it never
 * has), the API pushes through FCM, and the answer says exactly where it stopped when it did.
 */
export function PushTestButton({ businessId }: { businessId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const enabled = await enablePushNotifications(businessId);
      if (enabled === 'unsupported') {
        setMessage('This browser does not support notifications.');
        return;
      }
      if (enabled === 'denied') {
        setMessage('Notifications are blocked for this site. Allow them in the browser site settings, then try again.');
        return;
      }

      const res = await fetch(`/api/push/test?businessId=${encodeURIComponent(businessId)}`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => null)) as TestResponse | null;
      if (!res.ok || !data) {
        throw new Error(data?.error ?? `The test failed (${res.status}).`);
      }

      if (data.skipped === 'not-configured') {
        setMessage('The server is not configured to send pushes (Firebase Admin credentials missing).');
      } else if (data.skipped === 'no-tokens') {
        setMessage('No browser is registered for this business yet. Enable notifications on this browser first.');
      } else if (data.sent > 0) {
        setMessage(
          `Sent to ${data.sent} browser${data.sent === 1 ? '' : 's'}. If nothing appeared, the browser or OS is blocking notifications for this site.`,
        );
      } else {
        setMessage(`FCM rejected the push${data.firstError ? `: ${data.firstError}` : '.'}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The test could not run.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" onClick={test} disabled={busy}>
        <BellRing className="mr-2 h-4 w-4" />
        {busy ? 'Sending…' : 'Send test notification'}
      </Button>
      {message && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
