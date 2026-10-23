'use client';

import { useState } from 'react';
import { logout, signInWithEmail, signInWithGoogle, sendPasswordReset } from '@/lib/firebase';
import { operatorSignInAction } from '@/app/actions/logs-auth';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
        <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
        <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
        <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
        <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
      </g>
    </svg>
  );
}

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

/** `user` is the full operator email, prefilled so the account is visible but still editable. */
export function AdminLoginForm({ user }: { user: string }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Start empty: the operator types the full address they want to sign in with. The configured
  // account is only a placeholder, never a value appended to or forced into the field.
  const [typedUser, setTypedUser] = useState('');

  async function handleGoogle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const cred = await signInWithGoogle();
      await operatorSignInAction(await cred.user.getIdToken());
    } catch (err: unknown) {
      const failure = err as { code?: string; message?: string };
      if (!failure.code && String(failure.message ?? '').includes('NEXT_REDIRECT')) throw err;
      if (failure.code === 'auth/cancelled-popup-request' || failure.code === 'auth/popup-closed-by-user') return;
      if (failure.code === 'auth/unauthorized-domain') {
        setError(
          `This domain (${window.location.hostname}) is not authorized in Firebase. ` +
            'Open Firebase Console → Authentication → Settings → Authorized domains and add it.',
        );
      } else {
        setError(failure.message || 'Google sign-in failed.');
      }
      await logout().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const login = typedUser.trim() || user.trim();
    if (!login) { setError('Enter your operator email first.'); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendPasswordReset(login);
      setNotice('If that operator account exists, Firebase will send password reset instructions to its email address.');
    } catch (err) {
      const failure = err as { code?: string; message?: string };
      if (failure.code === 'auth/network-request-failed') setError('The browser could not reach Firebase. Check your connection and try again.');
      else setError(failure.code === 'auth/invalid-email' ? 'The operator email address is invalid.' : 'Could not start password recovery. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(formData: FormData) {
    const typed = String(formData.get('user') ?? '');
    const password = String(formData.get('password') ?? '');
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const credential = await signInWithEmail(typed, password);
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
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      <div className="relative my-2 text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
        <span className="relative z-10 bg-card px-2 text-muted-foreground">Or sign in with operator id</span>
      </div>

      <form action={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            name="user"
            type="email"
            value={typedUser}
            onChange={(event) => setTypedUser(event.target.value)}
            placeholder={user}
            autoComplete="username"
            required
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="-mt-2 text-right">
          <button type="button" onClick={resetPassword} disabled={busy} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">
            {busy ? 'Sending…' : 'Forgot password?'}
          </button>
        </div>
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
        {notice ? <p role="status" className="rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
