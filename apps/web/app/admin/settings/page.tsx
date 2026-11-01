import { KeyRound } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin-page-header';
import { Card } from '@/components/ui/card';
import { requireConsoleUser } from '@/lib/console-session';
import { getBrand } from '@/lib/brand-server';
import { changeConsolePasswordAction } from '@/app/actions/console-password';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Admin — settings — ${companyName}`,
    description: 'Change the signed-in console admin password.',
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireConsoleUser();
  const params = await searchParams;

  return (
    <div className="max-w-2xl space-y-6">
      <AdminPageHeader
        icon={KeyRound}
        title="Settings"
        description={
          <span>
            Signed in as <code>{user.email}</code>. This changes the password stored in the console
            admin database, not the legacy Firebase operator account.
          </span>
        }
      />

      {user.legacy ? (
        <Card className="border-amber-500/40">
          <p className="text-sm text-muted-foreground">
            This browser is using the legacy environment console password. Its password cannot be
            changed here; sign in with a DB admin account to manage a password.
          </p>
        </Card>
      ) : (
        <Card>
          <form action={changeConsolePasswordAction} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Current password</span>
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">New password</span>
                <input
                  name="next"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Repeat it</span>
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            {params.saved ? (
              <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Password changed. Other admin sessions were revoked.
              </p>
            ) : null}
            {params.error ? (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {params.error === 'match' ? 'The new passwords do not match.' : params.error}
              </p>
            ) : null}

            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Change password
            </button>
          </form>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        The superuser can also reset an admin password from <code>/superuser</code>, which revokes
        that admin’s active sessions.
      </p>
    </div>
  );
}
