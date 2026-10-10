import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin-login-form';
import { hasLogsSession, logsOperatorUser, operatorAccountEmail } from '@/lib/logs-session';

export const metadata = {
  title: 'Admin — sign in',
  description: 'Sign in to the Oryxa admin console.',
};

const MESSAGES: Record<string, string> = {
  invalid: 'That user id and password do not match.',
  disabled:
    'This deployment has no console secret. Set LOGS_UI_PASSWORD on the web app and the API, then try again.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await hasLogsSession()) redirect('/admin');

  const error = (await searchParams).error;
  const message = typeof error === 'string' ? MESSAGES[error] : undefined;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center py-10">
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
          The console signs in as <code>{operatorAccountEmail()}</code> through Firebase, which is
          also the account that owns the <code>oryxa-sandbox</code> store — so{' '}
          <Link href="/admin/agent-playground" className="underline hover:text-foreground">
            the playground
          </Link>{' '}
          works from here. A customer account signs in at{' '}
          <Link href="/login" className="underline hover:text-foreground">
            /login
          </Link>{' '}
          and reaches the logs through <code>LOG_QUERY_USER_IDS</code>.
        </p>
      </div>
    </div>
  );
}
