import Link from 'next/link';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedBusiness, cachedProduct, cachedProducts } from '@/app/_cache/queries';
import {
  paymentStrategyDescription,
  paymentStrategyLabel,
  resolvePaymentStrategy,
} from '@/lib/payment-strategy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { createOrderAction } from '@/app/actions/orders';
import NewOrderSkeleton from './skeleton';

export const instant = false;

export default function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ productId?: string; error?: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense
        fallback={
          <span className="text-sm text-[var(--muted-foreground)]">← Back to orders</span>
        }
      >
        <OrdersBackLink params={params} />
      </Suspense>
      <Suspense fallback={<NewOrderSkeleton />}>
        <NewOrderForm params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrdersBackLink({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <Link
      href={`/b/${businessId}/orders`}
      className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
    >
      ← Back to orders
    </Link>
  );
}

async function NewOrderForm({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ productId?: string; error?: string }>;
}) {
  const { businessId } = await params;
  const { productId = '', error } = await searchParams;
  const token = await requireAuth();

  const { products } = await cachedProducts(token, businessId, { limit: 100 });
  const business = await cachedBusiness(token, businessId).catch(() => null);
  const paymentMethods = business?.paymentMethods ?? [];
  const deliveryZones = business?.deliveryZones ?? [];

  let variants: Array<{ id: string; name: string; price?: number }> = [];
  let selectedDetail: Awaited<ReturnType<typeof cachedProduct>> | null = null;
  if (productId) {
    try {
      selectedDetail = await cachedProduct(token, businessId, productId);
      variants = selectedDetail.variants.map((v) => ({ id: v.id, name: v.name, price: v.price }));
    } catch {
      // ignore — variant select will just be empty
    }
  }

  // The product's own strategy wins over the store default; until a product is picked the
  // store default is what the form can promise, and picking one reloads with its rule.
  const strategy = resolvePaymentStrategy(
    business?.paymentStrategy,
    selectedDetail?.paymentStrategyOverride,
  );
  const needsUpfront = strategy.effective !== 'cod';

  return (
    <Card className="mt-4 sm:mt-6">
      <h1 className="text-xl font-bold">New order</h1>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error === 'required' ? 'Product and customer name are required.' : error}
        </p>
      ) : null}
      <form id="productPicker" method="get" className="hidden" />
      <form action={createOrderAction.bind(null, businessId)} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Product</label>
          <div className="flex gap-2">
            <Select
              name="productId"
              defaultValue={productId}
              form="productPicker"
              className="flex-1"
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.sku}
                </option>
              ))}
            </Select>
            <Button type="submit" form="productPicker" variant="outline">
              Load variants
            </Button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Variant</label>
          <Select name="variantId" defaultValue="" disabled={variants.length === 0}>
            <option value="">{variants.length === 0 ? 'No variants / use base price' : 'Select variant…'}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.price != null ? ` — $${v.price.toFixed(2)}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Quantity</label>
            <Input name="count" type="number" min="1" defaultValue="1" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Customer name</label>
            <Input name="customerName" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <Input name="customerPhone" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address</label>
            <Textarea name="customerAddress" rows={2} />
          </div>
        </div>

        <div
          className={
            strategy.isOverride
              ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
              : 'rounded-lg bg-[var(--muted)] px-3 py-2 text-sm text-[var(--muted-foreground)]'
          }
          role={strategy.isOverride ? 'alert' : undefined}
        >
          <span className="font-semibold text-[var(--foreground)]">
            Payment strategy: {paymentStrategyLabel(strategy.effective)}
          </span>
          {strategy.isOverride ? ' — this product overrides the store default. ' : ' '}
          {paymentStrategyDescription(strategy.effective)}
          {!selectedDetail ? ' Pick a product above (Load variants) to see its own rule if it has one.' : ''}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Delivery charge{deliveryZones.length ? '' : ' (BDT)'}
            </label>
            {deliveryZones.length ? (
              <Select name="shippingCost" defaultValue="">
                <option value="">Select delivery area…</option>
                {deliveryZones.map((zone) => (
                  <option key={zone.label} value={zone.price}>
                    {zone.label} — {zone.price.toFixed(2)}
                  </option>
                ))}
              </Select>
            ) : (
              <Input name="shippingCost" type="number" min="0" step="0.01" placeholder="0" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Payment method</label>
            <Select name="paymentMethod" defaultValue={needsUpfront ? '' : 'Cash on delivery'}>
              <option value="">Select payment method…</option>
              <option value="Cash on delivery" disabled={strategy.effective === 'full_prepaid'}>
                Cash on delivery{strategy.effective === 'full_prepaid' ? ' (not enough for this product)' : ''}
              </option>
              {paymentMethods.map((method) => (
                <option key={method.name} value={method.name}>
                  {method.name}
                  {method.requiresTransactionId ? ' (transaction id needed)' : ''}
                </option>
              ))}
            </Select>
            {needsUpfront && paymentMethods.length === 0 ? (
              <p className="mt-1 text-xs text-red-600">
                This strategy needs a prepaid method, but none is configured. Add one on the Payments page first.
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Transaction ID{needsUpfront ? '' : ' (when the method needs one)'}
            </label>
            <Input
              name="transactionId"
              placeholder="TrxID from the customer's payment confirmation"
              required={needsUpfront}
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {strategy.effective === 'delivery_prepaid'
                ? 'Required: the delivery charge must be paid first (any method above except cash on delivery). The product price stays payable on delivery.'
                : strategy.effective === 'full_prepaid'
                  ? 'Required: the full amount (product + delivery) must be paid first. Cash on delivery alone cannot create this order.'
                  : 'Only needed when the chosen method is marked as needing one.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Link href={`/b/${businessId}/orders`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" className="w-full sm:w-auto">Create order</Button>
        </div>
      </form>
    </Card>
  );
}
