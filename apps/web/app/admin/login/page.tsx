import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ConsoleLoginForm } from '@/components/console-login-form';
import { consoleLanding, getActiveConsoleUser } from '@/lib/console-session';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: 'Admin — sign in',
    description: `Sign in to the ${companyName} admin console.`,
  };
}

const MESSAGES: Record<string, string> = {
  rate_limited:
    'Too many sign-in attempts from this address — wait a few minutes and try again.',
  forbidden: 'Your admin account does not include that section.',
};

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<AdminLoginSkeleton />}>
      <AdminLoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminLoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const user = await getActiveConsoleUser();
  if (user) redirect(consoleLanding(user));
  const error = typeof params.error === 'string' ? params.error : undefined;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-7 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-geist text-xl font-bold text-primary-foreground shadow-md shadow-primary/20">
            O
          </div>
          <h1 className="font-geist text-xl font-bold tracking-tight">Admin console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the admin email and password created by the superuser.
          </p>
        </div>

        <ConsoleLoginForm endpoint="/api/admin/login" nextPath="/admin" firebaseBackfill />

        {message ? (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <div className="mt-5 space-y-2 text-center text-xs text-muted-foreground">
          <p>
            Superuser?{' '}
            <Link href="/superuser/login" className="underline hover:text-foreground">
              Manage admins here
            </Link>
            .
          </p>
          <p>
            Merchant?{' '}
            <Link href="/login" className="underline hover:text-foreground">
              Sign in at /login
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminLoginSkeleton() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center py-10">
      <div
        role="status"
        aria-busy="true"
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border/60 bg-card p-7 shadow-xl"
      >
        <span className="sr-only">Loading admin sign in form</span>
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-muted" />
        <div className="mx-auto h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
