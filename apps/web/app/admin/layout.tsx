import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminTabs } from '@/components/admin-tabs';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The tabs are the chrome of a signed-in console, so the sign-in page does not
  // offer a shortcut to a page the reader has not earned yet.
  const signedIn = Boolean((await logsBearer()) ?? (await getAuthToken()));

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6">
          <Link href={signedIn ? '/admin' : '/admin/login'} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-geist font-bold text-base shadow-md shadow-primary/20">
              O
            </div>
            <span className="font-geist text-lg font-bold tracking-tight text-foreground">
              Oryxa
            </span>
            <span className="text-sm text-muted-foreground">/ admin</span>
          </Link>
          <div className="flex items-center gap-3">
            {signedIn ? <AdminTabs /> : null}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
