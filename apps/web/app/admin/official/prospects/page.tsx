import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminOfficialProspects, ApiError, type OfficialProspect } from '@/lib/api';
import { officialProspectPatchAction, officialWeightsAction } from '@/app/actions/admin-official';
import { AdminPageHeader } from '@/components/admin-page-header';
import {
  isOfficialMigrationPending,
  OfficialMigrationCard,
} from '@/components/official-migration-card';

export const instant = false;

const STATUSES = ['new', 'reviewing', 'prioritized', 'onboarding_requested', 'onboarded', 'rejected'];

export default async function OfficialProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const bearer = await requireConsoleBearer();
  const params = await searchParams;

  let prospects: OfficialProspect[] = [];
  let weights: Record<string, number> = {};
  let loadError: string | null = null;
  let migrationPending = false;
  try {
    const body = await adminOfficialProspects(bearer, {
      status: params.status === 'all' ? undefined : (params.status ?? undefined),
    });
    prospects = body.prospects;
    weights = body.weights;
  } catch (err) {
    if (isOfficialMigrationPending(err)) {
      migrationPending = true;
    } else {
      loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The prospect list could not be read.';
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Prospects"
        description="People the official AI is onboarding: every field only appears because the customer themselves said it, and the consent line is recorded when they agreed."
        actions={
          <form className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <select name="status" defaultValue={params.status ?? 'all'} className="h-10 rounded-md border bg-card px-3 text-sm">
                {['all', ...STATUSES].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" className="h-10">Filter</Button>
          </form>
        }
      />

      {params.error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{params.error}</Card>
      )}
      {params.weights && (
        <Card className="border-primary/30 p-4 text-sm">
          Weights saved and every live prospect re-scored.
        </Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}
      {migrationPending && <OfficialMigrationCard />}

      {!loadError && !migrationPending && (
        <>
          <Card className="p-6">
            <h2 className="text-base font-semibold">Scoring weights</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Points per field a prospect gave. Zero removes the field from the ranking;
              consent always adds one.
            </p>
            <form action={officialWeightsAction} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(['name', 'country', 'businessType', 'employeesEstimate', 'budget', 'needs'] as const).map(
                (field) => (
                  <label key={field} className="text-sm">
                    <span className="mb-1 block font-medium">{field}</span>
                    <Input
                      name={field}
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      defaultValue={weights[field] ?? 0}
                    />
                  </label>
                ),
              )}
              <Button type="submit" className="self-end">Save &amp; re-score</Button>
            </form>
          </Card>

          {prospects.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="font-semibold">No prospects here yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                When a customer tells the official AI who they are and what they sell, a row
                appears with the score the weights above produce.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {prospects.map((prospect) => (
                <li key={prospect.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {prospect.score}
                      </span>
                      <p className="font-semibold">{prospect.name || 'Unnamed prospect'}</p>
                      <span className="text-xs text-muted-foreground">
                        {prospect.platform} · {prospect.contactPlatformId}
                      </span>
                      {prospect.consent !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            prospect.consent
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {prospect.consent ? 'consent to be saved' : 'no consent'}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        updated{' '}
                        {new Date(prospect.updatedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                      {[
                        ['Country', prospect.country],
                        ['Business', prospect.businessType],
                        ['Employees', prospect.employeesEstimate],
                        ['Budget', prospect.budget],
                        ['Needs', prospect.needs],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
                          <dd className="truncate">{value ? String(value) : '—'}</dd>
                        </div>
                      ))}
                    </dl>
                    {prospect.conversationId && (
                      <Link
                        href={`/admin/official/inbox/${prospect.conversationId}`}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        Open conversation
                      </Link>
                    )}

                    <form
                      action={officialProspectPatchAction}
                      className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                    >
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <select
                        name="status"
                        defaultValue={prospect.status}
                        className="rounded-md border bg-card px-2 py-1 text-xs"
                        aria-label={`Status of prospect ${prospect.id}`}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      <Input name="notes" className="h-8 w-64 text-xs" defaultValue={prospect.notes ?? ''} placeholder="Operator note" maxLength={8000} />
                      <Button type="submit" variant="outline" className="h-8 px-2 text-xs">Save</Button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
