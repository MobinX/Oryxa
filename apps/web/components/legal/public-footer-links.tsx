'use client';

import Link from 'next/link';
import { CookieSettingsButton } from '@/components/cookie-consent';

/** Legal links and a consent re-opener for the simple public pages. */
export function PublicFooterLinks() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
      <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
      <Link href="/cookies" className="hover:text-foreground hover:underline">Cookie policy</Link>
      <Link href="/data-delete-instructions" className="hover:text-foreground hover:underline">Data deletion</Link>
      <CookieSettingsButton className="hover:text-foreground hover:underline">
        Cookie settings
      </CookieSettingsButton>
    </div>
  );
}
