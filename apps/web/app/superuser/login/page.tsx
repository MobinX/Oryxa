import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ConsoleLoginForm } from '@/components/console-login-form';
import { getActiveConsoleUser } from '@/lib/console-session';

export const instant = false;

export const metadata = {
  title: 'Superuser — sign in',
  description: 'OnlyOrders superuser console.',
};

export default async function SuperuserLoginPage() {
  const user = await getActiveConsoleUser();
  if (user && !user.legacy && user.role === 'superuser') redirect('/superuser');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border/60 bg-card p-7 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-geist text-xl font-bold text-primary-foreground shadow-md shadow-primary/20">
            O
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Superuser
          </p>
          <h1 className="mt-1 font-geist text-xl font-bold tracking-tight">Admin management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the superuser account to create admins, set their mail and choose their
            console capabilities.
          </p>
        </div>

        {user && !user.legacy && user.role !== 'superuser' ? (
          <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            You are signed in as an admin ({user.email}). Signing in here replaces that console
            session with the superuser session.
          </p>
        ) : null}

        <ConsoleLoginForm endpoint="/api/superuser/login" nextPath="/superuser" />

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Admin?{' '}
          <Link href="/admin/login" className="underline hover:text-foreground">
            Sign in at /admin
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
