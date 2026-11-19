'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  enableMailPush,
  heartbeatMailPush,
  mailPushStatus,
  syncMailPush,
} from '@/lib/mail-push-client';

/**
 * Asks the signed-in admin once per browser session whether the inbox may notify them.
 * When permission is already granted (for example, granted on the sign-in screen), the
 * subscription renews silently and no prompt appears.
 */
export function MailPushPrompt({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const dismissKey = `mail-push-prompt:${email}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await mailPushStatus();
      if (cancelled) return;

      if (status.subscribed) {
        setSubscribed(true);
        void heartbeatMailPush();
        return;
      }

      if (status.permission === 'granted') {
        try {
          const ok = await syncMailPush();
          if (!cancelled && ok) setSubscribed(true);
        } catch (caught) {
          console.warn('[mail-push] silent subscribe failed:', caught);
        }
        return;
      }

      if (status.permission === 'default') {
        if (sessionStorage.getItem(dismissKey) === '1') return;
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dismissKey]);

  useEffect(() => {
    if (!subscribed) return;
    const timer = window.setInterval(() => void heartbeatMailPush(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [subscribed]);

  function notNow() {
    sessionStorage.setItem(dismissKey, '1');
    setOpen(false);
  }

  async function allow() {
    setPending(true);
    setError(null);
    try {
      const result = await enableMailPush();
      if (result === 'granted') {
        setSubscribed(true);
        setOpen(false);
        return;
      }
      setError(
        result === 'unsupported'
          ? 'This browser cannot receive notifications.'
          : 'Notifications are blocked. Allow them in the browser site settings to get inbox alerts.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mail alerts could not be enabled.');
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mail-push-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="mail-push-title" className="font-geist text-base font-semibold tracking-tight">
              Get email alerts
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Notify this device the moment new mail reaches your mailbox. Signing out stops the
              alerts.
            </p>
          </div>
          <button
            type="button"
            onClick={notNow}
            className="rounded-lg p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Not now"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={notNow}
            disabled={pending}
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={allow}
            disabled={pending}
            className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {pending ? 'Enabling…' : 'Enable alerts'}
          </button>
        </div>
      </div>
    </div>
  );
}
