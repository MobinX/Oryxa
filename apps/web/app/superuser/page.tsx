import Link from 'next/link';
import { LogOut, ShieldCheck } from 'lucide-react';
import { requireSuperuser, consoleApiFetch } from '@/lib/console-session';
import { getBrand } from '@/lib/brand-server';
import { superuserSignOutAction } from '@/app/actions/superuser';
import { SuperuserAdminManager } from '@/components/superuser-admin-manager';
import type { ConsoleUser } from '@/lib/console-capabilities';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Superuser — ${companyName}`,
    description: `Create and manage ${companyName} console admins.`,
    robots: { index: false, follow: false },
  };
}

export default async function SuperuserPage() {
  const user = await requireSuperuser();
  const { companyName } = await getBrand();

  let admins: ConsoleUser[] = [];
  let loadError: string | null = null;
  try {
    const data = await consoleApiFetch<{ admins: ConsoleUser[] }>('/api2/superuser/admins');
    admins = data.admins;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Admins could not be loaded';
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/40 bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary font-geist text-lg font-bold text-primary-foreground shadow-md shadow-primary/20">
              O
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {companyName}
              </p>
              <h1 className="flex items-center gap-1.5 font-geist text-lg font-bold tracking-tight">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Superuser
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Open admin console
            </Link>
            <form action={superuserSignOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6 text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{user.email}</strong>. Create admins,
          choose their mailbox identity and grant only the console sections they need.
        </p>
        {loadError ? (
          <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        ) : (
          <SuperuserAdminManager admins={admins} currentEmail={user.email} />
        )}
      </div>
    </main>
  );
}
