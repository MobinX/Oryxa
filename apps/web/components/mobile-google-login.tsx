'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getFirebaseAuth, getGoogleRedirectResult, signInWithGoogleRedirect } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useBrand } from '@/components/brand-provider';

const CALLBACK_SCHEME = 'onlyorders://auth';
const REDIRECT_FLAG = 'oo.mobile-google.redirect-started';

type Step = 'working' | 'ready' | 'done' | 'error';

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

function readFlag(): boolean {
  try {
    const value = sessionStorage.getItem(REDIRECT_FLAG);
    return value === '1';
  } catch {
    return false;
  }
}

function writeFlag(): void {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, '1');
  } catch {
    /* ignore */
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    /* ignore */
  }
}

export function MobileGoogleLogin() {
  const { companyName } = useBrand();
  const [step, setStep] = useState<Step>('working');
  const [message, setMessage] = useState('Taking you to Google…');
  const [account, setAccount] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const finish = useCallback(async (user: { uid: string; email: string | null; displayName: string | null; getIdTokenResult: () => Promise<{ token: string; expirationTime: string }>; } & Record<string, unknown>) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      const tokenResult = await (user as any).getIdTokenResult();
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

      const encoded = base64Url(JSON.stringify(payload));
      const link = `${CALLBACK_SCHEME}#p=${encoded}`;
      setDeepLink(link);
      setAccount(payload.email ?? payload.name ?? payload.uid);
      setStep('done');
      setMessage(refreshToken ? 'Signed in. Returning to OnlyOrders…' : 'Signed in. Returning to OnlyOrders…');

      // Bridge for an embedded WebView, if this page is ever hosted inside one.
      const w = window as unknown as {
        flutter_inappwebview?: { callHandler?: (name: string, args: string) => void };
        OnlyOrdersAuth?: { postMessage?: (value: string) => void };
      };
      try {
        w.flutter_inappwebview?.callHandler?.('onlyOrdersAuth', JSON.stringify(payload));
      } catch {
        /* ignore */
      }
      try {
        w.OnlyOrdersAuth?.postMessage?.(JSON.stringify(payload));
      } catch {
        /* ignore */
      }

      window.setTimeout(() => {
        try {
          window.location.href = link;
        } catch {
          /* ignore */
        }
      }, 600);
    } catch (error) {
      finishedRef.current = false;
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

    const started = readFlag();
    let cancelled = false;
    (async () => {
      // Returning from Google: the redirect credential is the first choice.
      // A persisted auth.currentUser is only a fallback, and only on a page load
      // that this tab marked as a redirect return — otherwise an old account
      // could be mistaken for the one just picked. The nonce in the payload is
      // still the final gate on the Flutter side.
      if (started) {
        let user: any = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const result = await getGoogleRedirectResult();
            if (cancelled) return;
            user = (result?.user as any) ?? null;
          } catch (error) {
            if (cancelled) return;
            clearFlag();
            setStep('error');
            setMessage(mapError(error));
            return;
          }
          if (user) break;
          // Firebase's pending redirect is occasionally still being written
          // when the page first runs (Custom Tabs / slow storage).
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        if (cancelled) return;
        if (user) {
          clearFlag();
          await finish(user);
          return;
        }

        // Firebase often restores the redirect user to persistence a beat after
        // getRedirectResult() is called. Because the redirect flag proves this
        // tab actually started the flow, waiting briefly for auth state is safe.
        const restored = await new Promise<any>((resolve) => {
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
          timer = window.setTimeout(() => done(null), 3000);
          try {
            unsub = auth.onAuthStateChanged((value) => {
              if (!value) return;
              // Only accept an account that signed in during this flow. A stale
              // persisted account must not masquerade as the one just picked.
              const last = (value as any)?.metadata?.lastSignInTime;
              const age = last ? Date.now() - Date.parse(last) : Number.NaN;
              if (Number.isFinite(age) && age >= 0 && age < 10 * 60 * 1000) {
                done(value);
              }
            });
          } catch {
            done(null);
          }
        });
        if (cancelled) return;
        if (restored) {
          clearFlag();
          await finish(restored);
          return;
        }

        // The result was genuinely lost. Try a popup immediately so the first
        // selection still completes without making the operator tap again.
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          const cred = await signInWithPopup(auth, provider);
          if (cancelled) return;
          clearFlag();
          await finish(cred.user as any);
          return;
        } catch (popupError) {
          const code = (popupError as { code?: string } | null)?.code ?? '';
          const expected =
            code === 'auth/popup-blocked' ||
            code === 'auth/operation-not-supported-in-this-environment' ||
            code === 'auth/cancelled-popup-request' ||
            code === 'auth/popup-closed-by-user';
          if (!expected) {
            if (cancelled) return;
            clearFlag();
            setStep('error');
            setMessage(mapError(popupError));
            return;
          }
        }
        if (cancelled) return;
        clearFlag();
        setStep('ready');
        setMessage('Google sign-in was not completed. Tap below to select your Google account.');
        return;
      }

      // Initial visit from mobile app: always sign out of any existing Firebase account first!
      if (startedRef.current) return;
      startedRef.current = true;
      setMessage('Signing out of existing session & opening Google Sign-In…');

      // Always sign out, even when currentUser is still null at this instant:
      // Firebase restores persistence asynchronously, so a conditional check
      // can skip the sign-out and let the previous account survive the redirect.
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }

      try {
        writeFlag();
        await signInWithGoogleRedirect();
      } catch (error) {
        clearFlag();
        if (cancelled) return;
        setStep('error');
        setMessage(mapError(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finish]);

  const startGoogle = useCallback(async () => {
    startedRef.current = true;
    setStep('working');
    setMessage('Signing out previous session & opening Google Sign-In…');
    const auth = getFirebaseAuth();
    if (!auth) {
      setStep('error');
      setMessage('Firebase is not configured on this deployment. Sign in is unavailable.');
      return;
    }
    try {
      if (auth.currentUser) {
        await auth.signOut();
      }
    } catch {
      /* ignore */
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const cred = await signInWithPopup(auth, provider);
      clearFlag();
      await finish(cred.user as any);
      return;
    } catch (popupError) {
      const code = (popupError as { code?: string } | null)?.code ?? '';
      if (code !== 'auth/popup-blocked' && code !== 'auth/operation-not-supported-in-this-environment' && code !== 'auth/cancelled-popup-request') {
        // Fall through to redirect only for blockers; otherwise surface the error.
        if (code !== 'auth/popup-closed-by-user') {
          clearFlag();
          setStep('error');
          setMessage(mapError(popupError));
          startedRef.current = false;
          return;
        }
      }
    }
    try {
      writeFlag();
      await signInWithGoogleRedirect();
    } catch (error) {
      clearFlag();
      setStep('error');
      setMessage(mapError(error));
      startedRef.current = false;
    }
  }, [finish]);

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
          Sign in with Google to use the mobile app. Any previous session is automatically logged out.
        </p>
      </div>

      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-7 space-y-4">
        {step === 'working' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
            <p className="text-sm text-[var(--muted-foreground)] text-center font-medium">{message}</p>
            <p className="text-xs text-[var(--muted-foreground)] text-center">
              Logging out any active session and opening Google account picker…
            </p>
          </div>
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