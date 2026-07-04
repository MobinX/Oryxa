'use client';

import { useState } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/firebase';
import { setAuthSession } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mode = 'signin' | 'signup';

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

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    if (loading) return;
    setLoading('google');
    setError(null);
    try {
      const cred = await signInWithGoogle();
      const idToken = await cred.user.getIdToken();
      await setAuthSession(idToken, {
        firebaseUid: cred.user.uid,
        name: cred.user.displayName ?? 'User',
        email: cred.user.email ?? undefined,
        signInMethod: 'google',
      });
    } catch (e: any) {
      if (e?.message === 'NEXT_REDIRECT' || String(e).includes('NEXT_REDIRECT')) throw e;
      if (e?.code === 'auth/cancelled-popup-request' || e?.code === 'auth/popup-closed-by-user') return;
      if (e?.code === 'auth/unauthorized-domain') {
        setError(`This domain (${window.location.hostname}) is not authorized in your Firebase project.`);
      } else {
        setError(e?.message || 'Google sign-in failed. Check Firebase configuration.');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    }

    setLoading('email');
    try {
      let cred;
      if (mode === 'signup') {
        cred = await signUpWithEmail(email, password, name.trim());
      } else {
        cred = await signInWithEmail(email, password);
      }
      const idToken = await cred.user.getIdToken();
      await setAuthSession(idToken, {
        firebaseUid: cred.user.uid,
        name: (cred.user.displayName ?? name.trim()) || 'User',
        email: cred.user.email ?? undefined,
        signInMethod: 'email',
      });
    } catch (e: any) {
      if (e?.message === 'NEXT_REDIRECT' || String(e).includes('NEXT_REDIRECT')) throw e;
      const code = e?.code as string | undefined;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 8 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(e?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Google Sign-In */}
      <button
        type="button"
        disabled={loading !== null}
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-3 h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <GoogleIcon />
        {loading === 'google' ? 'Connecting...' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-[var(--card)] text-[var(--muted-foreground)]">or continue with email</span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Full name</label>
            <Input
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading !== null}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Email address</label>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading !== null}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Password</label>
          <Input
            type="password"
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading !== null}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </div>
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Confirm password</label>
            <Input
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading !== null}
              autoComplete="new-password"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={loading !== null}
        >
          {loading === 'email'
            ? mode === 'signup' ? 'Creating account...' : 'Signing in...'
            : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {/* Mode Toggle */}
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        {mode === 'signin' ? (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
