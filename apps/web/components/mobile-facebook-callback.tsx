'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useBrand } from '@/components/brand-provider';

export function MobileFacebookCallback() {
  const { companyName } = useBrand();
  const [message, setMessage] = useState('Returning to OnlyOrders…');

  const [deepLink, setDeepLink] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const businessId = params.get('businessId');
    const error = params.get('error');
    const detail = params.get('detail');

    if (error) {
      setMessage(`Facebook connection failed: ${error}${detail ? ` (${detail})` : ''}. You can close this tab and try again in the app.`);
      return;
    }
    if (!token) {
      setMessage('No page selection token received. Close this tab and try again in the app.');
      return;
    }

    const payload = { v: 1, token, businessId: businessId ?? null };
    const encoded = btoa(JSON.stringify(payload));
    const link = `onlyorders://facebook#p=${encoded}`;
    setDeepLink(link);

    const w = window as unknown as {
      flutter_inappwebview?: { callHandler?: (name: string, args: string) => void };
      OnlyOrdersAuth?: { postMessage?: (value: string) => void };
    };
    try { w.flutter_inappwebview?.callHandler?.('onlyOrdersFacebook', JSON.stringify(payload)); } catch { /* ignore */ }
    try { w.OnlyOrdersAuth?.postMessage?.(JSON.stringify(payload)); } catch { /* ignore */ }

    const timer = window.setTimeout(() => {
      try { window.location.href = link; } catch { /* ignore */ }
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const openApp = () => {
    if (!deepLink) return;
    try { window.location.href = deepLink; } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] p-4">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] text-white font-bold text-2xl shadow-lg mb-4">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">{companyName}</h1>
      </div>
      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-7 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden />
        <p className="text-sm text-[var(--muted-foreground)] text-center">{message}</p>
        {deepLink && (
          <button
            type="button"
            className="w-full h-12 rounded-[14px] bg-[var(--primary)] text-white font-semibold hover:brightness-105 transition-all"
            onClick={openApp}
          >
            Open OnlyOrders
          </button>
        )}
      </div>
    </div>
  );
}