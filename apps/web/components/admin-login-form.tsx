'use client';

import { useState } from 'react';
import { logout, signInWithEmail } from '@/lib/firebase';
import { operatorSignInAction } from '@/app/actions/logs-auth';

/** Firebase's own codes, in the words a person typing a password needs. */
function messageFor(code: string): string {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'That user id and password do not match.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts from this address. Firebase lifts it after a pause.';
  }
  if (code === 'auth/user-disabled') return 'This operator account is disabled in Firebase.';
  if (code === 'auth/network-request-failed') return 'The browser could not reach Firebase. Try again.';
  if (code === 'auth/operation-not-allowed') {
    return 'This Firebase project has Email/Password sign-in switched off.';
  }
  if (code === 'auth/unauthorized-domain') return 'This host is not in Firebase → Authentication → Authorized domains.';
  return 'Sign-in failed.';
}

/**
 * `user` is what the console has always asked for; `domain` comes from the server, so the address
 * the account actually lives at is never typed and never guessed.
 */
export function AdminLoginForm({ user, domain }: { user: string; domain: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    const typed = String(formData.get('user') ?? '');
    const password = String(formData.get('password') ?? '');
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const credential = await signInWithEmail(typed.includes('@') ? typed : `${typed}@${domain}`, password);
      // Throws NEXT_REDIRECT on success, and on the failure redirects below — both must escape.
      await operatorSignInAction(await credential.user.getIdToken());
    } catch (err) {
      const failure = err as { code?: string; message?: string };
      if (!failure.code && String(failure.message ?? '').includes('NEXT_REDIRECT')) throw err;
      setError(messageFor(failure.code ?? ''));
      // A rejected password can leave the browser holding a half-finished session; drop it so the
      // next attempt starts where the first one did.
      await logout().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">User id</span>
        <input
          name="user"
          defaultValue={user}
          autoComplete="username"
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
