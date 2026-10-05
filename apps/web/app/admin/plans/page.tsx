import { redirect } from 'next/navigation';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getAuthToken } from '@/lib/auth';
import { logsBearer } from '@/lib/logs-session';
import { cachedAdminBusinessPlans, cachedPlans } from '@/app/_cache/queries';
import { ApiError } from '@/lib/api';
import { PlansConsole } from './plans-table';

export default async function AdminPlansPage() {
  const bearer = (await logsBearer()) ?? (await getAuthToken());
  if (!bearer) redirect('/admin/login');

  const [plansRead, businessesRead] = await Promise.all([
    adminRead(() => cachedPlans(bearer)),
    adminRead(() => cachedAdminBusinessPlans(bearer)),
  ]);

  const error =
    'error' in plansRead
      ? plansRead.error
      : 'error' in businessesRead
        ? businessesRead.error
        : null;
  const plans = 'value' in plansRead ? plansRead.value : [];
  const businesses = 'value' in businessesRead ? businessesRead.value : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <CreditCard className="h-6 w-6 text-primary" />
            Plans
          </h1>
          <p className="mt-1 text-muted-foreground">
            What each plan allows, who is on it, and what happens to them the moment you change it.
          </p>
        </div>
      </div>

      <Card className="border-amber-500/40 hover:shadow-card">
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Saving a plan is a fleet-wide action
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Limits are read from this table when the agent is about to reply — they are never copied onto
          a business — so an edit takes effect at the next inbound message for every business in the
          <em> Businesses</em> column, with no job to wait for. An empty limit means{' '}
          <strong>uncapped</strong>; a limit of <strong>0</strong> means <strong>no replies at all</strong>.
          Setting 0 on a busy plan is the fastest kill switch in the system, and the number of businesses
          it stops is the count on that row.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Deleting a plan is refused while any business sits on it, because releasing them to{' '}
          <code>plan_id = NULL</code> would hand them unlimited replies. Retire it instead.
        </p>
      </Card>

      {error ? (
        <Card className="border-destructive/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The plans did not load
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page reads <code>/api2/admin/plans</code>, which needs the same key as the event log:
            the console password from <code>/admin/login</code>, or an account named in{' '}
            <code>LOG_QUERY_USER_IDS</code>. Migration <code>0012</code> must be applied for the tables
            to exist.
          </p>
        </Card>
      ) : (
        <PlansConsole plans={plans} businesses={businesses} />
      )}
    </div>
  );
}

type Read<T> = { error: string } | { value: T };

/**
 * A cached read that may fail. The page still has to answer: an empty table is honest
 * where a thrown error would replace the console with Next's default screen.
 */
async function adminRead<T>(load: () => Promise<T>): Promise<Read<T>> {
  try {
    return { value: await load() };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/admin/login');
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'The API could not be reached' };
  }
}
