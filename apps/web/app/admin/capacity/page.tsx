import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, adminListBusinessPlans, getAdminCapacity, type AdminBusinessPlan } from '@/lib/api';
import { CapacityForm } from './capacity-form';

export const instant = false;

/**
 * Capacity & waitlist (spec C). One business, picked with the picker: the numbers the AI
 * quotes about availability must be exactly what the operator stores here, so nothing
 * defaults into an availability claim.
 */
export default async function AdminCapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { business } = await searchParams;

  let businesses: AdminBusinessPlan[] = [];
  let loadError: string | null = null;
  try {
    businesses = await adminListBusinessPlans(bearer);
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  const active = businesses.find((b) => b.businessId === business) ?? businesses[0] ?? null;

  let capacity = null;
  let capacityError: string | null = null;
  if (active) {
    try {
      capacity = await getAdminCapacity(bearer, active.businessId);
    } catch (err) {
      capacityError = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Users className="h-6 w-6 text-primary" />
          Capacity &amp; waitlist
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          What the AI is allowed to claim about availability. When the store is full, it says
          exactly what you write here and offers the waitlist only if waitlisting is on.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}
      {!loadError && businesses.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No businesses yet</p>
          <p className="mx-auto mt-2 text-sm text-muted-foreground">A store&apos;s capacity page appears here once one exists.</p>
        </Card>
      )}
      {!loadError && businesses.length > 0 && !active && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">Business not found.</Card>
      )}
      {capacityError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{capacityError}</Card>
      )}

      {active && capacity && !capacityError && (
        <CapacityForm bearer={bearer} capacity={capacity} />
      )}
    </div>
  );
}
