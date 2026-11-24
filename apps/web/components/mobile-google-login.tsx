'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getFirebaseAuth, getGoogleRedirectResult, signInWithGoogleRedirect } from '@/lib/firebase';
import { GoogleAuthProvider } from 'firebase/auth';
import { useBrand } from '@/components/brand-provider';

const CALLBACK_SCHEME = 'onlyorders://auth';
const RETURN_FLAG = 'oo.mobile-google.redirect-pending';
const LOG_TAG = 'GOOGLE_LOGIN_STEP';
const logSession = Math.random().toString(36).slice(2, 10);

type Step = 'working' | 'finalizing' | 'ready' | 'done' | 'error';

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

function markRedirectStarted(): void {
  try {
    localStorage.setItem(RETURN_FLAG, '1');
  } catch {
    /* ignore */
  }
}

function clearRedirectFlag(): void {
  try {
    localStorage.removeItem(RETURN_FLAG);
  } catch {
    /* ignore */
  }
}

function isRedirectReturn(): boolean {
  try {
    return localStorage.getItem(RETURN_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Force the account picker, then let Google return to this page. */
async function openAccountPicker(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured on this deployment.');
  try {
    await auth.signOut();
  } catch {
    /* ignore: select_account still forces the picker */
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  markRedirectStarted();
  await signInWithGoogleRedirect();
}

export function MobileGoogleLogin() {
  const { companyName } = useBrand();
  const [step, setStep] = useState<Step>('working');
  const [message, setMessage] = useState('Opening Google…');
  const [account, setAccount] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const finish = useCallback(async (user: any) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    logStep('result-received');
    try {
      // Capture everything before signOut: a signed-out user cannot mint tokens.
      const tokenResult = await user.getIdTokenResult();
      const refreshToken = user?.stsTokenManager?.refreshToken ?? null;
      const state = new URLSearchParams(window.location.search).get('state') ?? '';
      const payload: Payload = {
        v: 1,
        idToken: tokenResult.token,
        refreshToken,
        uid: user.uid,
        email: user.email ?? null,
        name: user.displayName ?? null,
        expiresIn: Math.max(60, Math.floor((new Date(tokenResult.expirationTime).getTime() - Date.now()) / 1000)),
        issuedAt: Date.now(),
        state,
      };

      const auth = getFirebaseAuth();
      if (auth) {
        setStep('finalizing');
        setMessage('Finishing sign-in…');
        try { await auth.signOut(); } catch { /* ignore */ }
      }
      clearRedirectFlag();

      const encoded = base64Url(JSON.stringify(payload));
      const link = `${CALLBACK_SCHEME}#p=${encoded}`;
      setDeepLink(link);
      setAccount(payload.email ?? payload.name ?? payload.uid);
      setStep('done');
      setMessage('Signed in. Returning to OnlyOrders…');

      const w = window as unknown as {
        flutter_inappwebview?: { callHandler?: (name: string, args: string) => void };
        OnlyOrdersAuth?: { postMessage?: (value: string) => void };
      };
      try { w.flutter_inappwebview?.callHandler?.('onlyOrdersAuth', JSON.stringify(payload)); } catch { /* ignore */ }
      try { w.OnlyOrdersAuth?.postMessage?.(JSON.stringify(payload)); } catch { /* ignore */ }
      logStep('returning-to-app');
      window.setTimeout(() => {
        try { window.location.href = link; } catch { /* ignore */ }
      }, 400);
    } catch (error) {
      finishedRef.current = false;
      clearRedirectFlag();
      setStep('error');
      setMessage(mapError(error));
    }
  }, []);

  useEffect(() => {
    if (!getFirebaseAuth()) {
      setStep('error');
      setMessage('Firebase is not configured on this deployment. Sign in is unavailable.');
      return;
    }

    const wasReturn = isRedirectReturn();
    logStep('page-load', `return=${wasReturn}`);
    let cancelled = false;

    (async () => {
      if (startedRef.current) return;
      startedRef.current = true;

      // Google returned here: consume the one pending redirect result.
      if (wasReturn) {
        let user: any = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            const result = await getGoogleRedirectResult();
            user = (result?.user as any) ?? null;
            logStep('redirect-result', `attempt=${attempt} found=${Boolean(user)}`);
          } catch (error) {
            if (cancelled) return;
            setStep('error');
            setMessage(mapError(error));
            return;
          }
          if (user) break;
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
        if (cancelled) return;
        if (user) {
          await finish(user);
          return;
        }
        // The result was lost. Do not silently open Google again: that loops.
        clearRedirectFlag();
        startedRef.current = false;
        setStep('ready');
        setMessage('Sign-in was interrupted. Choose your Google account again.');
        logStep('result-lost');
        return;
      }

      // Fresh visit from the app: straight to the account picker.
      setMessage('Opening Google…');
      try {
        await openAccountPicker();
      } catch (error) {
        if (cancelled) return;
        setStep('error');
        setMessage(mapError(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finish]);

  const chooseAccount = useCallback(async () => {
    setStep('working');
    setMessage('Opening Google…');
    try {
      await openAccountPicker();
    } catch (error) {
      setStep('error');
      setMessage(mapError(error));
    }
  }, []);

  const openApp = useCallback(() => {
    if (!deepLink) return;
    try { window.location.href = deepLink; } catch { /* ignore */ }
  }, [deepLink]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] p-4">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] text-white font-bold text-2xl shadow-lg mb-4">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">{companyName}</h1>
        <p className="mt-2 text-[var(--muted-foreground)] text-sm max-w-xs">
          Choose your Google account to continue in the mobile app.
        </p>
      </div>

      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-7 space-y-4">
        {(step === 'working' || step === 'finalizing') && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
            <p className="text-sm text-[var(--muted-foreground)] text-center font-medium">{message}</p>
          </div>
        )}

        {step === 'ready' && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] text-center">{message}</p>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] bg-[var(--primary)] text-white font-semibold hover:brightness-105 transition-all shadow-sm"
              onClick={chooseAccount}
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
              onClick={chooseAccount}
            >
              Try again
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
