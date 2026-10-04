'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TZ_COOKIE } from '@/lib/logs-time';

function stored(name: string): string | undefined {
  const raw = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : undefined;
}

/**
 * The server cannot see the reader's clock, so the browser says it once: this
 * writes what `Intl` resolved and re-renders the page, which then formats every
 * timestamp — and reads every typed bound — against that zone. If the page comes
 * back naming a different zone, this one's runtime did not recognise it, and the
 * browser stops arguing instead of refreshing forever.
 */
export function TzProbe({ expected }: { expected: string }) {
  const router = useRouter();

  useEffect(() => {
    let resolved: string | undefined;
    try {
      resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!resolved || resolved === expected || stored(TZ_COOKIE) === resolved) return;

    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(resolved)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [expected, router]);

  return null;
}
