'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getFirebaseAuth, changePassword, logout } from '@/lib/firebase';

/** Firebase's own codes, in the words a person changing a password needs. */
function messageFor(code: string): string {
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
    return 'The current password is not the one this account answers with.';
  }
  if (code === 'auth/weak-password') return 'Firebase wants at least 6 characters in the new password.';
  if (code === 'auth/requires-recent-login') {
    return 'Firebase could not confirm this sign-in is recent. Sign in again and retry within a few minutes of that.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts from this address. Firebase lifts it after a pause.';
  if (code === 'auth/no-current-user' || code === 'auth/user-mismatch') {
    return 'This browser is not holding the operator account. Sign in at /admin/login, then change it here.';
  }
  if (code === 'auth/network-request-failed') return 'The browser could not reach Firebase. Try again.';
  return 'The password was not changed.';
}

/**
 * The account whose password changes here is the one Firebase is holding in this browser, and the
 * page is opened under the console cookie — two different proofs. They have to name the same
 * account, or a console holder could quietly rewrite the password of whoever the browser happens
 * to be signed in as. So the emails are compared before anything is sent to Firebase.
 */
export function PasswordSettingsForm({ operatorEmail }: { operatorEmail: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(formData: FormData) {
    if (busy) return;
    const current = String(formData.get('current') ?? '');
    const next = String(formData.get('next') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    if (next.length < 6) {
      setNotice({ tone: 'bad', text: messageFor('auth/weak-password') });
      return;
    }
    if (next !== confirm) {
      setNotice({ tone: 'bad', text: 'The two new passwords do not match.' });
      return;
    }

    const signedInAs = getFirebaseAuth()?.currentUser?.email?.toLowerCase();
    if (signedInAs !== operatorEmail.toLowerCase()) {
      setNotice({ tone: 'bad', text: messageFor('auth/no-current-user') });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      await changePassword(current, next);
      setNotice({
        tone: 'ok',
        text: 'Password changed. This browser stays signed in; everywhere else now needs the new one.',
      });
      formRef.current?.reset();
    } catch (err) {
      const failure = err as { code?: string };
      const text = messageFor(failure.code ?? '');
      setNotice({ tone: 'bad', text });
      // A rejected re-authentication can leave a half-proven session behind; dropping it puts the
      // next attempt back where this one started instead of stacked on top of it.
      if (failure.code !== 'auth/weak-password' && failure.code !== 'auth/network-request-failed') {
        await logout().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form ref={formRef} action={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Current password</span>
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <span className="block text-xs text-muted-foreground">
            Firebase asks for it again before accepting a change — proving this sign-in is recent is
            the check that makes the rest safe.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">New password</span>
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Repeat it</span>
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        {notice ? (
          <p
            className={`rounded-xl border px-3 py-2 text-sm ${
              notice.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}
