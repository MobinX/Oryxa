'use client';

import Link from 'next/link';
import { useBrand } from '@/components/brand-provider';
import { OnlyOrdesLogo } from '@/components/sidebar';

const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Live demo', href: '#live-demo' },
      { label: 'Features', href: '#workflow' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Solutions', href: '/solutions' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Sign in', href: '/login' },
      { label: 'Get started', href: '/login' },
    ],
  },
  {
    heading: 'Trust',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Data deletion', href: '/data-delete-instructions' },
    ],
  },
];

export function MarketingFooter() {
  const { companyName } = useBrand();

  return (
    <footer className="relative mt-24 border-t border-white/10 bg-[#060709]/80 backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5B3DF5]/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[180px] w-[min(560px,120vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(91,61,245,0.10),transparent)] blur-3xl"
      />
      <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">

        <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-12 py-14 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="max-w-xs space-y-4">
            <OnlyOrdesLogo lightText />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">
              Commerce autopilot
            </p>
            <p className="text-sm leading-relaxed text-slate-400">
              The AI copilot for social sellers — from the first salaam to the
              five-star review.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:gap-16">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {col.heading}
                </p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-slate-400 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/70"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] py-6 text-xs text-slate-600 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <p className="text-slate-600">
            Made for social sellers, everywhere they sell.
          </p>
        </div>
      </div>
    </footer>
  );
}