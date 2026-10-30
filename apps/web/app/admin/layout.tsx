import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminSidebar } from '@/components/admin-sidebar';
import { SignOutForm } from '@/components/sign-out-button';
import { logsSignOutAction } from '@/app/actions/logs-auth';
import { logsBearer } from '@/lib/logs-session';
import { getBrand } from '@/lib/brand-server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The rail is the chrome of a signed-in console, so the sign-in page does not offer a
  // shortcut to a page the reader has not earned yet. Only the console's own session
  // counts as earned: an account token proves a merchant, not an operator.
  const signedIn = Boolean(await logsBearer());
  const { companyName } = await getBrand();

  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground transition-colors duration-200">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/85 backdrop-blur-md">
        <div className="relative mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link
              href={signedIn ? '/admin' : '/admin/login'}
              className="flex min-w-0 shrink items-center gap-2"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-base shadow-md shadow-primary/20">
                O
              </div>
              <span className="truncate font-geist text-base font-bold tracking-tight text-foreground sm:text-lg">
                {companyName}
              </span>
              <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">/ admin</span>
            </Link>
            <div className="flex min-w-0 shrink items-center justify-end gap-2 sm:gap-3">
              <ThemeToggle />
              {signedIn ? (
                <SignOutForm
                  action={logsSignOutAction}
                  title="End this console session"
                  className="flex h-10 items-center gap-2 rounded-xl border border-border/80 bg-card px-2.5 text-sm font-medium text-muted-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-60 sm:px-3"
                >
                  <LogOut className="h-4 w-4 stroke-[1.75]" />
                  <span className="hidden sm:inline">Sign out</span>
                </SignOutForm>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      {/* One column pair: the sidebar is a sticky item of this flex box, the page its
          neighbour, so the two can never paint over each other again. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col px-0 lg:flex-row lg:items-start">
        <AdminSidebar signedIn={signedIn} />
        <main className="min-w-0 flex-1 px-4 pb-10 pt-2 sm:px-6 sm:pt-6">{children}</main>
      </div>
    </div>
  );
}
