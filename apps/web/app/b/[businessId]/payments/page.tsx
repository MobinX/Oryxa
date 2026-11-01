import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness } from '@/app/_cache/queries';
import { Card } from '@/components/ui/card';
import { DeliveryZonesEditor } from '@/components/payments/delivery-zones-editor';
import { PaymentMethodsEditor } from '@/components/payments/payment-methods-editor';
import { PaymentStrategyEditor } from '@/components/payments/payment-strategy-editor';
import {
  updateDeliveryZonesAction,
  updatePaymentMethodsAction,
  updatePaymentStrategyAction,
} from '@/app/actions/payments';

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
          Set the delivery charge for each region, the ways customers pay you, and how much must
          be paid before an order can be placed. The AI quotes only these amounts and methods,
          and an order cannot be created until the payment strategy for that product is met.
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
      {(saved === '1' || saved === 'strategy') && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ {saved === 'strategy' ? 'Payment strategy saved.' : 'Payment settings saved.'}
        </Card>
      )}
      {error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error === 'price'
            ? 'Every region needs a delivery price of 0 or more. Blank rows are saved as nothing; a named region cannot be left without one.'
            : error === 'duplicate'
              ? 'Two payment methods share the same name. The customer’s words are matched against that name, so it has to be unique — keep one of them.'
              : error === 'methods'
                ? 'Those payment methods could not be read. Please try again.'
                : error === 'strategy'
                  ? 'That payment strategy could not be read. Please choose one of the three options and try again.'
                  : 'Those delivery charges could not be read. Please try again.'}
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold">Payment methods</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          How customers pay you, in your own words. The agent offers cash on delivery plus exactly
          these, tells the customer the number or account you wrote, and will not create an order
          for a method that needs a transaction id until that id arrives.
        </p>
        <PaymentMethodsEditor
          action={updatePaymentMethodsAction.bind(null, businessId)}
          initial={business.paymentMethods ?? []}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Payment strategy</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          How much a customer must pay before an order can be placed. This applies to every
          product, unless a product overrides it in its own form. Cash on delivery needs nothing
          up front; the prepaid options need a configured method above (not cash on delivery)
          and its transaction id before the order exists.
        </p>
        <PaymentStrategyEditor
          action={updatePaymentStrategyAction.bind(null, businessId)}
          initial={business.paymentStrategy ?? 'cod'}
        />
      </Card>

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
        <h2 className="text-lg font-semibold">How orders are paid</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Cash on delivery always works and asks for nothing up front. A method you ticked as
          needing a transaction id cannot be ordered until the customer gives that id — the agent,
          the inbox order form and the saved order all enforce it. Payment is not gateway-verified
          in the console; you confirm the money on your side.
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
