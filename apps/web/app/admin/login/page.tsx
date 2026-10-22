import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminLoginForm } from '@/components/admin-login-form';
import { hasLogsSession, logsOperatorUser, operatorAccountEmail } from '@/lib/logs-session';
import { COMPANY_NAME } from '@/lib/brand';

export const metadata = {
  title: 'Admin — sign in',
  description: `Sign in to the ${COMPANY_NAME} admin console.`,
};

const MESSAGES: Record<string, string> = {
  invalid: 'That user id and password do not match.',
  rate_limited:
    'Too many sign-in attempts from this address — wait a few minutes and try again.',
  disabled:
    'This deployment has no console secret. Set LOGS_UI_PASSWORD on the web app and the API, then try again.',
  notoperator:
    'The console is open, but this browser is not holding the operator account’s token — it belongs to somebody else, or it has expired. Sign in again to use the playground.',
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
  const error = (await searchParams).error;

  // Someone bounced out of the playground still has a valid session, and sending them back to
  // /admin would hide both the reason they were turned out and the sign-in that replaces the
  // hour-old token the playground needs.
  if (!error && (await hasLogsSession())) redirect('/admin');

  const message = typeof error === 'string' ? MESSAGES[error] : undefined;

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-7 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-geist text-xl font-bold text-primary-foreground shadow-md shadow-primary/20">
            O
          </div>
          <h1 className="font-geist text-xl font-bold tracking-tight">Admin console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform numbers, requests, agent runs, webhooks and failures.
          </p>
        </div>

        <AdminLoginForm
          user={logsOperatorUser()}
          domain={operatorAccountEmail().split('@')[1] ?? 'oryxa.app'}
        />

        {message ? (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Sign in with an authorized operator Google account or the Firebase password for{' '}
          <code>{operatorAccountEmail()}</code>. The console account also accesses the{' '}
          <code>oryxa-sandbox</code> store, so{' '}
          <Link href="/admin/agent-playground" className="underline hover:text-foreground">
            the playground
          </Link>{' '}
          works from here. Merchant accounts sign in at{' '}
          <Link href="/login" className="underline hover:text-foreground">
            /login
          </Link>.
        </p>
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
