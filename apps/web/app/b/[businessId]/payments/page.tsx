import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness } from '@/app/_cache/queries';
import { Card } from '@/components/ui/card';
import { DeliveryZonesEditor } from '@/components/payments/delivery-zones-editor';
import { updateDeliveryZonesAction } from '@/app/actions/payments';

export default function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Payments</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Set the delivery charge for each region. The AI quotes only these amounts and records
          the matching charge on the order.
        </p>
      </div>
      <Suspense fallback={<PaymentsSkeleton />}>
        <PaymentsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { businessId } = await params;
  const { saved, error } = await searchParams;
  const token = await requireAuth();
  const business = await cachedBusiness(token, businessId);

  return (
    <>
      {saved === '1' && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Delivery charges saved.
        </Card>
      )}
      {error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error === 'price'
            ? 'Every region needs a delivery price of 0 or more. Blank rows are saved as nothing; a named region cannot be left without one.'
            : 'Those delivery charges could not be read. Please try again.'}
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Delivery charges by region</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Add every region you deliver to and what you charge. The sales agent asks the customer
          for their area, quotes the matching price, and passes it to the order as the delivery
          charge.
        </p>
        <DeliveryZonesEditor
          action={updateDeliveryZonesAction.bind(null, businessId)}
          initial={business.deliveryZones ?? []}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">How customers pay</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Checkout is cash on delivery, bKash or Nagad in the customer’s own words. The order
          records the method and, for mobile payments, the transaction ID the customer types;
          payment is not gateway-verified in the console.
        </p>
      </Card>
    </>
  );
}

function PaymentsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Card className="space-y-3">
        <div className="h-5 w-52 animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-10 animate-pulse rounded-lg bg-[var(--muted)]" />
        <div className="h-10 animate-pulse rounded-lg bg-[var(--muted)]" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-[var(--muted)]" />
      </Card>
      <span className="sr-only">Loading payment settings</span>
    </div>
  );
}
