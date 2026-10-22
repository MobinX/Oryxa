'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { OnlyOrdesLogo } from '@/components/sidebar';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Product', href: '#live-demo' },
  { label: 'Features', href: '#workflow' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full px-4 pt-4 sm:px-6">
      <div className="relative mx-auto max-w-[1200px]">
        <nav
          aria-label="Primary"
          className="flex h-14 items-center justify-between rounded-2xl border border-white/10 bg-[#0B0C13]/75 px-4 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:px-5"
        >
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
            >
              <OnlyOrdesLogo lightText />
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-2.5 md:flex">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] px-4.5 py-2 text-sm font-semibold text-white shadow-[0_0_28px_-6px_rgba(91,61,245,0.7)] transition hover:brightness-110 active:scale-97 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav-panel"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.09] md:hidden"
          >
            {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </nav>

        {/* Mobile dropdown */}
        <div
          id="mobile-nav-panel"
          className={cn(
            'absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 origin-top rounded-2xl border border-white/10 bg-[#0B0C13]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl transition md:hidden',
            open ? 'pointer-events-auto opacity-100' : 'invisible -translate-y-1 scale-95 opacity-0',
          )}
        >
          <div className="grid gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#5B3DF5] to-[#7C3AED] text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(91,61,245,0.7)] transition hover:brightness-110"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
