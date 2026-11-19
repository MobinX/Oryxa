'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import {
  disableMailPush,
  enableMailPush,
  heartbeatMailPush,
  mailPushStatus,
  sendTestMailPush,
  syncMailPush,
} from '@/lib/mail-push-client';

type Permission = NotificationPermission | 'unsupported';

/**
 * Mailbox notification control. The signed-in admin gets one prompt, a bell that always shows
 * the current state, and a test send, so a blocked browser is never silent.
 */
export function MailPushControl({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [known, setKnown] = useState(false);

  const dismissKey = `mail-push-prompt:${email}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await mailPushStatus();
        if (cancelled) return;
        setPermission(status.permission);

        if (status.subscribed) {
          setSubscribed(true);
          void heartbeatMailPush();
          return;
        }

        if (status.permission === 'granted') {
          try {
            if (await syncMailPush()) {
              if (!cancelled) setSubscribed(true);
              return;
            }
            if (!cancelled) {
              setError('The browser allows notifications, but the mailbox registration failed.');
            }
          } catch (caught) {
            if (!cancelled) {
              setError(
                caught instanceof Error ? caught.message : 'Mail alerts could not be registered.',
              );
            }
          }
          // A granted-but-failed browser needs the dialog; it is not a silent dead end.
          if (!cancelled && sessionStorage.getItem(dismissKey) !== '1') setOpen(true);
          return;
        }

        if (status.permission === 'default' && sessionStorage.getItem(dismissKey) !== '1') {
          setOpen(true);
        }
        // 'denied' and 'unsupported' stay quiet until the bell is clicked.
      } finally {
        if (!cancelled) setKnown(true);
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

  function syncPermission() {
    setPermission(
      typeof window === 'undefined' || !('Notification' in window)
        ? 'unsupported'
        : Notification.permission,
    );
  }

  function openPanel() {
    setError(null);
    setNotice(null);
    syncPermission();
    setOpen(true);
  }

  function notNow() {
    sessionStorage.setItem(dismissKey, '1');
    setOpen(false);
  }

  async function allow() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await enableMailPush();
      syncPermission();
      if (result === 'granted') {
        setSubscribed(true);
        setNotice('Alerts are on. Send a test to confirm they arrive.');
        return;
      }
      setError(
        result === 'unsupported'
          ? 'This browser cannot receive notifications.'
          : 'Notifications are blocked. Allow them in the browser site settings, then try again.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mail alerts could not be enabled.');
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendTestMailPush();
      if (!result.configured) {
        setError('The mail worker has no Firebase credentials yet, so nothing can be sent.');
      } else if (result.subscriptions === 0) {
        setError('This session has no registered device. Enable alerts first.');
      } else if (result.sent === 0) {
        setError(
          `Firebase rejected the alert (${result.errorCode ?? 'unknown error'}). Re-enable alerts to get a fresh token.`,
        );
      } else {
        setNotice(`Test sent to ${result.sent} device${result.sent === 1 ? '' : 's'}. Check this browser's notifications.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The test alert could not be sent.');
    } finally {
      setPending(false);
    }
  }

  async function turnOff() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await disableMailPush();
      setSubscribed(false);
      setNotice('Alerts are off for this browser.');
    } catch {
      setError('Alerts could not be turned off.');
    } finally {
      setPending(false);
    }
  }

  const state = subscribed ? 'on' : permission === 'denied' ? 'blocked' : 'off';
  const label =
    state === 'on'
      ? 'Email alerts are on for this browser'
      : state === 'blocked'
        ? 'Email alerts are blocked in this browser'
        : 'Enable email alerts';

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title={label}
        aria-label={label}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {state === 'on' ? (
          <BellRing className="h-4 w-4" aria-hidden />
        ) : state === 'blocked' ? (
          <BellOff className="h-4 w-4" aria-hidden />
        ) : (
          <Bell className="h-4 w-4" aria-hidden />
        )}
        {known ? (
          <span
            aria-hidden
            className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
              state === 'on' ? 'bg-emerald-500' : state === 'blocked' ? 'bg-destructive' : 'bg-amber-500'
            }`}
          />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mail-push-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {state === 'blocked' ? (
                  <BellOff className="h-5 w-5" aria-hidden />
                ) : (
                  <Bell className="h-5 w-5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="mail-push-title" className="font-geist text-base font-semibold tracking-tight">
                  {state === 'on'
                    ? 'Email alerts are on'
                    : state === 'blocked'
                      ? 'Notifications are blocked'
                      : 'Get email alerts'}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {state === 'on'
                    ? 'This device is notified the moment new mail reaches your mailbox. Signing out stops the alerts.'
                    : state === 'blocked'
                      ? 'This browser has blocked notifications for the site. Open the site settings (the lock or tune icon in the address bar), allow notifications, then reload this page.'
                      : 'Notify this device the moment new mail reaches your mailbox. Signing out stops the alerts.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {permission === 'unsupported' ? (
              <p className="mt-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                This browser does not support web notifications. On iPhone, add the site to the home
                screen first.
              </p>
            ) : null}

            {error ? (
              <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                {error}
              </p>
            ) : null}

            {notice ? (
              <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
                {notice}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              {state === 'on' ? (
                <>
                  <button
                    type="button"
                    onClick={sendTest}
                    disabled={pending}
                    className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {pending ? 'Sending…' : 'Send test alert'}
                  </button>
                  <button
                    type="button"
                    onClick={turnOff}
                    disabled={pending}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    Turn off for this browser
                  </button>
                </>
              ) : state === 'blocked' ? (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Close
                </button>
              ) : (
                <div className="flex gap-2">
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
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
