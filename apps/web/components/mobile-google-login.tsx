'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { firebaseConfig, getGoogleRedirectResult } from '@/lib/firebase';
import { useBrand } from '@/components/brand-provider';

const CALLBACK_SCHEME = 'onlyorders://auth';
const LOG_TAG = 'GOOGLE_LOGIN_STEP';
const logSession = Math.random().toString(36).slice(2, 10);

type Step = 'working' | 'relaying' | 'ready' | 'done' | 'error';

interface RelayTokens {
  idToken: string;
  refreshToken: string | null;
  uid: string;
  email: string | null;
  name: string | null;
  expiresIn: number;
}

interface Payload extends RelayTokens {
  v: 1;
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
  const message = (error as { message?: string } | null)?.message ?? '';
  return message ? `Google sign-in failed: ${message}` : 'Google sign-in failed. Try again.';
}

/** Firebase's hosted sign-in portal, returning to this exact page. */
function authPortalUrl(): string {
  const url = new URL(`https://${firebaseConfig.authDomain}/__/auth/handler`);
  url.searchParams.set('apiKey', firebaseConfig.apiKey ?? '');
  url.searchParams.set('appName', '[DEFAULT]');
  url.searchParams.set('authType', 'signInViaRedirect');
  url.searchParams.set('redirectUrl', window.location.href);
  url.searchParams.set('v', '11.10.0');
  url.searchParams.set('eventId', String(Date.now()));
  url.searchParams.set('providerId', 'google.com');
  url.searchParams.set('customParameters', JSON.stringify({ prompt: 'select_account' }));
  url.searchParams.set('scopes', 'profile');
  return url.toString();
}

/** Fallback for a provider token in the callback URL: exchange via Firebase REST. */
async function exchangeGoogleToken(idToken: string): Promise<RelayTokens> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
        requestUri: `${window.location.origin}${window.location.pathname}`,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? 'token exchange failed');
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? null,
    uid: data.localId,
    email: data.email ?? null,
    name: data.displayName ?? null,
    expiresIn: Number.parseInt(data.expiresIn ?? '3600', 10),
  };
}

export function MobileGoogleLogin() {
  const { companyName } = useBrand();
  const [step, setStep] = useState<Step>('working');
  const [message, setMessage] = useState('Opening Google…');
  const [account, setAccount] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const relay = useCallback(async (tokens: RelayTokens) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      const payload: Payload = {
        v: 1,
        ...tokens,
        issuedAt: Date.now(),
        state: new URLSearchParams(window.location.search).get('state') ?? '',
      };
      setStep('relaying');
      setMessage('Returning to OnlyOrders…');
      const encoded = base64Url(JSON.stringify(payload));
      const link = `${CALLBACK_SCHEME}#p=${encoded}`;
      setDeepLink(link);
      setAccount(payload.email ?? payload.name ?? payload.uid);
      setStep('done');

      const w = window as unknown as {
        flutter_inappwebview?: { callHandler?: (name: string, args: string) => void };
        OnlyOrdersAuth?: { postMessage?: (value: string) => void };
      };
      try { w.flutter_inappwebview?.callHandler?.('onlyOrdersAuth', JSON.stringify(payload)); } catch { /* ignore */ }
      try { w.OnlyOrdersAuth?.postMessage?.(JSON.stringify(payload)); } catch { /* ignore */ }
      logStep('relay-to-app');
      window.setTimeout(() => {
        try { window.location.href = link; } catch { /* ignore */ }
      }, 400);
    } catch (error) {
      finishedRef.current = false;
      setStep('error');
      setMessage(mapError(error));
    }
  }, []);

  const openGoogle = useCallback(() => {
    setStep('working');
    setMessage('Opening Google…');
    logStep('open-auth-portal');
    window.location.href = authPortalUrl();
  }, []);

  useEffect(() => {
    logStep('relay-page-load');
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      // The Firebase portal calls back here with the credential.
      let user: any = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const result = await getGoogleRedirectResult();
          user = (result?.user as any) ?? null;
          logStep('callback-result', `attempt=${attempt} found=${Boolean(user)}`);
        } catch (error) {
          logStep('callback-error');
          break;
        }
        if (user) break;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }

      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          await relay({
            idToken: tokenResult.token,
            refreshToken: user?.stsTokenManager?.refreshToken ?? null,
            uid: user.uid,
            email: user.email ?? null,
            name: user.displayName ?? null,
            expiresIn: Math.max(60, Math.floor((new Date(tokenResult.expirationTime).getTime() - Date.now()) / 1000)),
          });
        } catch (error) {
          setStep('error');
          setMessage(mapError(error));
        }
        return;
      }

      // Some portals return the provider token directly in the callback URL.
      const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
      const providerToken = params.get('id_token') || params.get('oauthIdToken');
      if (providerToken) {
        try {
          await relay(await exchangeGoogleToken(providerToken));
        } catch (error) {
          setStep('error');
          setMessage(mapError(error));
        }
        return;
      }

      setStep('ready');
      setMessage('Choose your Google account to continue.');
    })();
  }, [relay]);

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
        {(step === 'working' || step === 'relaying') && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
            <p className="text-sm text-[var(--muted-foreground)] text-center font-medium">{message}</p>
          </div>
        )}

        {(step === 'ready' || step === 'error') && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] text-center">{message}</p>
            <button
              type="button"
              className="w-full h-12 rounded-[14px] bg-[var(--primary)] text-white font-semibold hover:brightness-105 transition-all"
              onClick={openGoogle}
            >
              Choose Google Account
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
