import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { LogOut, PenLine } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutForm } from '@/components/sign-out-button';
import { getActiveConsoleUser } from '@/lib/console-session';
import { consoleCan } from '@/lib/console-capabilities';
import { getBrand } from '@/lib/brand-server';
import { mailSignOutAction } from '@/app/mails/actions';

/** The dedicated mail console: never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function MailboxLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveConsoleUser();
  if (!user) redirect('/mails/login');
  if (!consoleCan(user, 'inbox')) redirect('/admin');

  const { companyName } = await getBrand();
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() || 'M';

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="z-30 shrink-0 border-b border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <Link
            href="/mails"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-geist text-base font-bold text-primary-foreground">
              O
            </span>
            <span className="truncate font-geist text-base font-semibold tracking-tight sm:text-lg">
              {companyName}
            </span>
            <span className="hidden shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
              Mail
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className="hidden min-w-0 items-center gap-2 rounded-full border border-border/60 bg-muted/50 py-1 pl-1 pr-3 md:flex">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
              >
                {initial}
              </span>
              <span className="max-w-[12rem] truncate text-xs font-medium text-muted-foreground lg:max-w-[15rem]">
                {user.email}
              </span>
            </span>
            <Link
              href="/mails/compose"
              title="Compose a message"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-3.5"
            >
              <PenLine className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Compose</span>
            </Link>
            <ThemeToggle />
            <SignOutForm
              action={mailSignOutAction}
              title="Sign out of mail"
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none sm:px-3"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </SignOutForm>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
        {children}
      </main>
    </div>
  );
}
