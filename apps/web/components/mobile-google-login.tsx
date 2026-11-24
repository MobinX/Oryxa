'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getFirebaseAuth, getGoogleRedirectResult, signInWithGoogleRedirect } from '@/lib/firebase';
import { useBrand } from '@/components/brand-provider';

const CALLBACK_SCHEME = 'onlyorders://auth';
const REDIRECT_FLAG = 'oo.mobile-google.redirect-started';
// localStorage survives a new Custom Tab, unlike sessionStorage.
const RETURN_FLAG = 'oo.mobile-google.redirect-pending';

type Step = 'working' | 'chooser' | 'finalizing' | 'ready' | 'done' | 'error';

type FirebaseAuth = NonNullable<ReturnType<typeof getFirebaseAuth>>;

/** Firebase restores its persisted user asynchronously, so wait briefly for a
 * restored account instead of trusting a synchronous currentUser read. */
function waitForCurrentUser(auth: FirebaseAuth, timeoutMs = 1000): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    let timer: number | undefined;
    const done = (value: any) => {
      if (settled) return;
      settled = true;
      try { unsub?.(); } catch { /* ignore */ }
      if (timer !== undefined) window.clearTimeout(timer);
      resolve(value);
    };
    timer = window.setTimeout(() => done(null), timeoutMs);
    try {
      unsub = auth.onAuthStateChanged((value) => {
        if (value) done(value);
      });
    } catch {
      done(null);
    }
  });
}

const LOG_TAG = 'GOOGLE_LOGIN_STEP';
const logSession = Math.random().toString(36).slice(2, 10);

/** One event per POST so Axiom keeps every step (batch dedupes by level). */
function logStep(step: string, detail = ''): void {
  try {
    void fetch('/api/v1/mobile/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{
          level: 'info',
          tag: LOG_TAG,
          message: `step=${step} sid=${logSession}${detail ? ` ${detail}` : ''}`,
        }],
      }),
      keepalive: true,
    });
  } catch {
    /* diagnostics must never break sign-in */
  }
}

function logStepError(step: string, code: string): void {
  try {
    void fetch('/api/v1/mobile/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{
          level: 'error',
          tag: LOG_TAG,
          message: `step=${step} sid=${logSession} code=${code}`,
        }],
      }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

/** Sign out and wait until Firebase confirms there is no current user before
 * starting a new-account flow or handing the preserved payload to the app. */
function signOutAndWait(auth: FirebaseAuth, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    let timer: number | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      try { unsub?.(); } catch { /* ignore */ }
      if (timer !== undefined) window.clearTimeout(timer);
      resolve();
    };
    try {
      unsub = auth.onAuthStateChanged((value) => {
        if (!value) done();
      });
    } catch { /* ignore */ }
    timer = window.setTimeout(done, timeoutMs);
    try {
      Promise.resolve(auth.signOut())
        .catch(() => undefined)
        .then(() => {
          if (auth.currentUser === null) done();
        });
    } catch {
      done();
    }
  });
}

interface Payload {
  v: 1;
  idToken: string;
  refreshToken: string | null;
  uid: string;
  email: string | null;
  name: string | null;
  expiresIn: number;
  issuedAt: number;
  /** One-time nonce from the mobile app: a stale deep link must never sign in. */
  state: string;
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mapError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message = (error as { message?: string } | null)?.message ?? '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return `This domain (${hostname}) is not authorized in Firebase. Ask the operator to add it under Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-supported-in-this-environment':
      return 'Google sign-in is not available in this browser. Open this page in Chrome.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your connection and try again.';
    case 'auth/cancelled-popup-request':
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method.';
    default:
      return message ? `Google sign-in failed: ${message}` : 'Google sign-in failed. Try again.';
  }
}

/** A redirect result is only trusted when the sign-in happened moments ago. */
function isRecentSignIn(value: any): boolean {
  const last = value?.metadata?.lastSignInTime;
  const age = last ? Date.now() - Date.parse(last) : Number.NaN;
  return Number.isFinite(age) && age >= 0 && age < 15 * 1000;
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(REDIRECT_FLAG);
    localStorage.removeItem(RETURN_FLAG);
  } catch {
    /* ignore */
  }
}

function markRedirectStarted(): void {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, '1');
    localStorage.setItem(RETURN_FLAG, '1');
  } catch {
    /* ignore */
  }
}

function returningFromRedirect(): boolean {
  try {
    if (localStorage.getItem(RETURN_FLAG) === '1') return true;
  } catch {
    /* ignore */
  }
  const referrer = document.referrer || '';
  return referrer.includes('accounts.google.com') || referrer.includes('firebaseapp.com');
}

export function MobileGoogleLogin() {
  const { companyName } = useBrand();
  const [step, setStep] = useState<Step>('working');
  const [message, setMessage] = useState('Taking you to Google…');
  const [account, setAccount] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const existingUserRef = useRef<any>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const finish = useCallback(async (user: { uid: string; email: string | null; displayName: string | null; getIdTokenResult: () => Promise<{ token: string; expirationTime: string }>; } & Record<string, unknown>) => {
    if (finishedRef.current) {
      logStep('finish-duplicate-call');
      return;
    }
    finishedRef.current = true;
    logStep('finish-start');
    try {
      const tokenResult = await (user as any).getIdTokenResult();
      logStep('token-captured', `hasRefresh=${Boolean((user as any)?.stsTokenManager?.refreshToken)}`);
      const internal = user as unknown as { stsTokenManager?: { refreshToken?: string } };
      const refreshToken = internal.stsTokenManager?.refreshToken ?? null;
      const expiresIn = Math.max(60, Math.floor((new Date(tokenResult.expirationTime).getTime() - Date.now()) / 1000));
      const state = new URLSearchParams(window.location.search).get('state') ?? '';
      const payload: Payload = {
        v: 1,
        idToken: tokenResult.token,
        refreshToken,
        uid: user.uid,
        email: user.email ?? null,
        name: user.displayName ?? null,
        expiresIn,
        issuedAt: Date.now(),
        state,
      };

      // Preserve the sign-in info first. A signed-out user object can no longer
      // mint tokens, but the captured ID token stays valid until its expiry.
      const preserved = payload;

      const auth = getFirebaseAuth();
      if (auth) {
        setStep('finalizing');
        setMessage('Finishing sign-in…');
        logStep('finish-signout-start');
        await signOutAndWait(auth);
        logStep('finish-signout-done', `currentUserNull=${auth.currentUser === null}`);
      }

      const encoded = base64Url(JSON.stringify(preserved));
      const link = `${CALLBACK_SCHEME}#p=${encoded}`;
      logStep('deeplink-built', `hasState=${state.length > 0}`);
      setDeepLink(link);
      setAccount(preserved.email ?? preserved.name ?? preserved.uid);
      setStep('done');
      setMessage('Signed in. Returning to OnlyOrders…');

      // Bridge for an embedded WebView, if this page is ever hosted inside one.
      const w = window as unknown as {
        flutter_inappwebview?: { callHandler?: (name: string, args: string) => void };
        OnlyOrdersAuth?: { postMessage?: (value: string) => void };
      };
      try {
        w.flutter_inappwebview?.callHandler?.('onlyOrdersAuth', JSON.stringify(preserved));
      } catch {
        /* ignore */
      }
      try {
        w.OnlyOrdersAuth?.postMessage?.(JSON.stringify(preserved));
      } catch {
        /* ignore */
      }

      logStep('navigate-to-app-scheduled');
      window.setTimeout(() => {
        try {
          logStep('navigate-to-app');
          window.location.href = link;
        } catch {
          /* ignore */
        }
      }, 600);
    } catch (error) {
      finishedRef.current = false;
      logStepError('finish-failed', (error as { code?: string })?.code ?? 'unknown');
      setStep('error');
      setMessage(mapError(error));
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setStep('error');
      setMessage('Firebase is not configured on this deployment. Sign in is unavailable.');
      return;
    }

    const isReturn = returningFromRedirect();
    logStep(
      'page-load',
      `hasState=${new URLSearchParams(window.location.search).has('state')} return=${isReturn} referrer=${(document.referrer || 'none').split('/')[2] ?? 'none'}`,
    );
    const unsubAuth = auth.onAuthStateChanged((value) => {
      logStep('auth-state', `signedIn=${Boolean(value)}`);
    });
    let cancelled = false;
    (async () => {
      if (startedRef.current) {
        logStep('effect-reentry-skipped');
        return;
      }
      startedRef.current = true;

      // The SDK stores a pending redirect result in its own persistence, not in
      // our tab's sessionStorage. A Custom Tab can return from Google in a new
      // tab where that flag is gone, so read the result on EVERY load. Gating
      // this on the flag made the return look like a fresh visit and sent the
      // operator through Google a second time.
      let user: any = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const result = await getGoogleRedirectResult();
          if (cancelled) return;
          user = (result?.user as any) ?? null;
          logStep('redirect-result', `attempt=${attempt} found=${Boolean(user)} recent=${user ? isRecentSignIn(user) : false}`);
        } catch (error) {
          if (cancelled) return;
          logStepError('redirect-result-failed', (error as { code?: string })?.code ?? 'unknown');
          setStep('error');
          setMessage(mapError(error));
          return;
        }
        if (user && isRecentSignIn(user)) break;
        user = null;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      if (cancelled) return;
      if (user) {
        clearFlag();
        logStep('redirect-result-accepted');
        await finish(user);
        return;
      }
      logStep('no-redirect-result');

      // The SDK's pending redirect can be lost when a Custom Tab returns in a
      // different browsing context. Wait for Firebase to restore its user
      // before ever starting another Google round-trip.
      if (isReturn) {
        setMessage('Completing Google sign-in…');
        logStep('redirect-return-wait-start');
        const returned = await waitForCurrentUser(auth, 10000);
        if (cancelled) return;
        logStep('redirect-return-wait-done', `found=${Boolean(returned)}`);
        if (returned) {
          clearFlag();
          await finish(returned);
          return;
        }
        // Never auto-redirect a second time from a return visit: that was the
        // infinite loop. Let the operator trigger it explicitly.
        clearFlag();
        startedRef.current = false;
        setStep('ready');
        setMessage('Google sign-in could not be completed in this browser. Tap to try again.');
        logStep('redirect-return-loop-stopped');
        return;
      }

      // No redirect result: offer the already persisted account.
      setMessage('Checking for an existing Google account…');
      const existing = await waitForCurrentUser(auth);
      if (cancelled) return;
      logStep('persisted-user-check', `found=${Boolean(existing)}`);
      if (existing) {
        existingUserRef.current = existing;
        setExistingEmail(existing.email ?? existing.displayName ?? existing.uid ?? 'this account');
        setStep('chooser');
        logStep('chooser-shown');
        return;
      }

      setMessage('Opening Google Sign-In…');
      logStep('redirect-start');
      try {
        markRedirectStarted();
        await signInWithGoogleRedirect();
      } catch (error) {
        clearFlag();
        if (cancelled) return;
        logStepError('redirect-start-failed', (error as { code?: string })?.code ?? 'unknown');
        setStep('error');
        setMessage(mapError(error));
      }
    })();

    return () => {
      cancelled = true;
      try { unsubAuth(); } catch { /* ignore */ }
    };
  }, [finish]);

  const startGoogle = useCallback(async () => {
    startedRef.current = true;
    setStep('working');
    setMessage('Opening Google Sign-In…');
    if (!getFirebaseAuth()) {
      setStep('error');
      setMessage('Firebase is not configured on this deployment. Sign in is unavailable.');
      return;
    }
    // Redirect works in Chrome Custom Tabs; popups are blocked there.
    logStep('manual-redirect-start');
    try {
      markRedirectStarted();
      await signInWithGoogleRedirect();
    } catch (error) {
      clearFlag();
      logStepError('manual-redirect-failed', (error as { code?: string })?.code ?? 'unknown');
      setStep('error');
      setMessage(mapError(error));
      startedRef.current = false;
    }
  }, []);

  const openApp = useCallback(() => {
    if (!deepLink) return;
    try {
      window.location.href = deepLink;
    } catch {
      /* ignore */
    }
  }, [deepLink]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] p-4">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] text-white font-bold text-2xl shadow-lg mb-4">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">{companyName}</h1>
        <p className="mt-2 text-[var(--muted-foreground)] text-sm max-w-xs">
          Sign in with Google to use the mobile app. You can continue with your current account or choose a new one.
        </p>
      </div>

      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-7 space-y-4">
        {step === 'working' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
            <p className="text-sm text-[var(--muted-foreground)] text-center font-medium">{message}</p>
            <p className="text-xs text-[var(--muted-foreground)] text-center">
              Preparing Google sign-in…
            </p>
          </div>
        )}

        {step === 'finalizing' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
            <p className="text-sm text-[var(--muted-foreground)] text-center font-medium">{message}</p>
          </div>
        )}

        {step === 'chooser' && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] text-center">
              You are already signed in as <span className="font-semibold">{existingEmail}</span>.
            </p>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] bg-[var(--primary)] text-white font-semibold hover:brightness-105 transition-all shadow-sm"
              onClick={() => {
                logStep('chooser-continue-clicked');
                finish(existingUserRef.current);
              }}
            >
              Continue with {existingEmail}
            </button>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold hover:bg-[var(--muted)] transition-colors shadow-sm"
              onClick={async () => {
                const auth = getFirebaseAuth();
                logStep('chooser-new-account-clicked');
                setStep('working');
                setMessage('Signing out…');
                if (auth) {
                  logStep('chooser-signout-start');
                  await signOutAndWait(auth);
                  logStep('chooser-signout-done');
                }
                startGoogle();
              }}
            >
              Sign out and login with new account
            </button>
          </>
        )}

        {step === 'ready' && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] text-center">{message}</p>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold hover:bg-[var(--muted)] transition-colors shadow-sm"
              onClick={startGoogle}
            >
              Choose Google Account
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <p className="text-sm text-[var(--danger)] text-center">{message}</p>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] font-semibold hover:bg-[var(--muted)] transition-colors"
              onClick={startGoogle}
            >
              Try Google again
            </button>
          </>
        )}

        {step === 'done' && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] text-center">
              Signed in as {account}.{' '}
              {deepLink ? 'Returning to OnlyOrders…' : 'Tap below to return.'}
            </p>
            {deepLink && (
              <button
                type="button"
                className="w-full h-12 rounded-[14px] bg-[var(--primary)] text-white font-semibold hover:brightness-105 transition-all"
                onClick={openApp}
              >
                Open OnlyOrders
              </button>
            )}
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-[var(--muted-foreground)] text-center max-w-sm">
        By continuing, you agree to our{' '}
        <a href="/terms" className="underline hover:text-[var(--foreground)]">Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" className="underline hover:text-[var(--foreground)]">Privacy Policy</a>.
      </p>
    </div>
  );
}