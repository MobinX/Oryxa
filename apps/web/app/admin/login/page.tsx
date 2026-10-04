import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logsSignInAction } from '@/app/actions/logs-auth';
import { hasLogsSession, logsOperatorUser } from '@/lib/logs-session';

export const metadata = {
  title: 'Admin — sign in',
  description: 'Sign in to the Oryxa admin console.',
};

const MESSAGES: Record<string, string> = {
  invalid: 'That user id and password do not match.',
  disabled:
    'This deployment has no console password. Set LOGS_UI_PASSWORD on the web app and the API, then try again.',
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

        <form action={logsSignInAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">User id</span>
            <input
              name="user"
              defaultValue={logsOperatorUser()}
              autoComplete="username"
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>

          {message ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          A customer account on this host signs in at{' '}
          <Link href="/login" className="underline hover:text-foreground">
            /login
          </Link>{' '}
          and reaches the logs through <code>LOG_QUERY_USER_IDS</code>.
        </p>
      </div>
    </div>
  );
}
