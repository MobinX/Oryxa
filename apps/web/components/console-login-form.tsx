'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signInWithEmail } from '@/lib/firebase';

type Props = {
  endpoint: '/api/admin/login' | '/api/superuser/login';
  nextPath: string;
  firebaseBackfill?: boolean;
};

export function ConsoleLoginForm({ endpoint, nextPath, firebaseBackfill = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        firebase?: { email?: string; password?: string } | null;
      };
      if (!response.ok) {
        setError(data.error || 'Sign-in failed');
        return;
      }

      if (firebaseBackfill && data.firebase?.email && data.firebase?.password) {
        try {
          const credential = await signInWithEmail(data.firebase.email, data.firebase.password);
          const idToken = await credential.user.getIdToken();
          await fetch('/api/admin/firebase-session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
        } catch (firebaseError) {
          // DB sign-in already succeeded; the console still works. The shared Firebase
          // account only restores the legacy operator/playground capabilities.
          console.warn('Firebase compatibility sign-in failed', firebaseError);
        }
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setError('The sign-in service could not be reached');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Admin email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@onlyorders.tech"
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
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      {firebaseBackfill ? (
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          After DB sign-in the console also attaches the legacy Firebase workspace account for
          backward-compatible playground access.
        </p>
      ) : null}
    </form>
  );
}
