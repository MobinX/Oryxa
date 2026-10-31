'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useBrand } from '@/components/brand-provider';
import { supportEmailForHost } from '@/lib/brand';
import { CookieSettingsButton } from '@/components/cookie-consent';
import { OnlyOrdesLogo } from '@/components/sidebar';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/cookies', label: 'Cookies' },
];

export function LegalPage({
  title,
  subtitle,
  updated,
  icon: Icon,
  current,
  children,
}: {
  title: string;
  subtitle: string;
  updated: string;
  icon: LucideIcon;
  current: string;
  children: React.ReactNode;
}) {
  const { companyName: COMPANY_NAME, parentCompanyName: PARENT_COMPANY_NAME } = useBrand();
  const sameEntity = COMPANY_NAME === PARENT_COMPANY_NAME;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-background font-inter text-foreground transition-colors duration-300">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <OnlyOrdesLogo />
          </Link>

          <nav aria-label="Legal" className="hidden items-center gap-1 md:flex">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current === link.href ? 'page' : undefined}
                className={
                  current === link.href
                    ? 'rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary'
                    : 'rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground'
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="pointer-events-none absolute left-1/2 top-28 -z-10 h-[420px] w-[min(560px,110vw)] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <article className="relative z-10 w-full max-w-3xl space-y-8 rounded-card border border-border/50 bg-card p-5 shadow-card sm:p-10">
          <div className="flex flex-col items-center gap-4 border-b border-border/40 pb-6 text-center sm:flex-row sm:text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Icon className="h-6 w-6 stroke-[2]" />
            </span>
            <div className="min-w-0">
              <h1 className="font-geist text-3xl font-black tracking-tight text-foreground">{title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Last updated: {updated}
                {sameEntity ? '' : ` · ${COMPANY_NAME} is a product of ${PARENT_COMPANY_NAME}`}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="space-y-7 text-sm leading-relaxed text-muted-foreground">{children}</div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-6">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-element border border-border bg-card px-5 text-xs font-bold tracking-wide text-foreground shadow-sm transition hover:bg-muted active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 stroke-[2.5]" /> Back to home
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-primary">
              {LEGAL_LINKS.filter((link) => link.href !== current).map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
              <CookieSettingsButton className="text-xs font-semibold text-primary hover:underline" />
            </div>
          </div>
        </article>
      </main>

      <footer className="border-t border-border/40 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
        <p>
          © {new Date().getFullYear()} {COMPANY_NAME}.
          {sameEntity ? '' : ` A product of ${PARENT_COMPANY_NAME}.`} All rights reserved.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
          <Link href="/cookies" className="hover:text-foreground hover:underline">Cookie policy</Link>
          <Link href="/data-delete-instructions" className="hover:text-foreground hover:underline">Data deletion</Link>
          <Link href="/contact" className="hover:text-foreground hover:underline">Contact</Link>
          <CookieSettingsButton className="underline-offset-2 hover:text-foreground hover:underline" />
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="font-geist text-base font-bold text-foreground">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export function LegalContact({ companyName }: { companyName: string }) {
  const { host } = useBrand();
  const supportEmail = supportEmailForHost(host);
  return (
    <div className="space-y-1 rounded-lg border border-border/40 bg-muted/40 p-4 text-xs text-muted-foreground">
      <p><strong className="text-foreground">{companyName} — Software Division</strong></p>
      <p>Email: {supportEmail}</p>
      <p>
        Address:<br />
        51, Mirpur Road<br />
        Room 517, Alpana Plaza, Level 5<br />
        Dhaka 1205<br />
        Bangladesh
      </p>
    </div>
  );
}
