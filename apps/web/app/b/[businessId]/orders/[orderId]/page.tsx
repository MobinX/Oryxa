import Link from 'next/link';
import { formatTaka } from '@/lib/order-state';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { cachedOrder } from '@/app/_cache/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, Badge } from '@/components/ui/card';
import {
  updateOrderAction,
  deleteOrderAction,
  advanceOrderStateAction,
} from '@/app/actions/orders';
import OrderDetailSkeleton from './skeleton';
import { paymentStrategyLabel } from '@/lib/payment-strategy';

const stateVariant: Record<string, 'warning' | 'info' | 'purple' | 'success'> = {
  pending: 'warning',
  acknowledged: 'info',
  onDelivery: 'purple',
  done: 'success',
};

const nextState: Record<string, string> = {
  pending: 'acknowledged',
  acknowledged: 'onDelivery',
  onDelivery: 'done',
};

export const instant = false;

export default function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
  searchParams: Promise<{ error?: string }>;
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
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrdersBackLink({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
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

async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { businessId, orderId } = await params;
  const { error } = await searchParams;
  const token = await requireAuth();

  let order;
  try {
    order = await cachedOrder(token, businessId, orderId);
  } catch {
    notFound();
  }

  return (
    <Card className="mt-4 sm:mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Order {order.id.slice(0, 8)}</h1>
          <p className="mt-1 break-all font-mono text-xs text-[var(--muted-foreground)]">
            {order.id}
          </p>
        </div>
        <Badge variant={stateVariant[order.state] ?? 'default'}>{order.state}</Badge>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg bg-[var(--muted)] p-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-[var(--muted-foreground)]">Total: </span>
          <strong>{formatTaka(order.totalPrice, order.currency)}</strong>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Unit price: </span>
          {formatTaka(order.variantPrice, order.currency)} × {order.count}
        </div>
        <div className="sm:col-span-2 flex items-start gap-3">
          {order.variantImageUrl ? (
            <img
              src={order.variantImageUrl}
              alt={order.variantName ?? order.productName ?? 'Product'}
              className="h-16 w-16 shrink-0 rounded-lg object-cover border border-[var(--border)]"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[var(--background)] text-xs text-[var(--muted-foreground)] border border-[var(--border)]">
              No img
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <div>
              <span className="text-[var(--muted-foreground)]">Product: </span>
              {order.productId ? (
                <Link
                  href={`/b/${businessId}/products/${order.productId}/edit`}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  {order.productName ?? 'View product'}
                </Link>
              ) : (
                <span>{order.productName ?? '—'}</span>
              )}
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Variant: </span>
              <span className="font-medium">{order.variantName ?? '—'}</span>
              {order.variantShortId && (
                <span className="ml-2 font-mono text-xs text-[var(--muted-foreground)]">
                  #{order.variantShortId}
                </span>
              )}
            </div>
          </div>
        </div>
        {order.shippingCost !== undefined && order.shippingCost > 0 && (
          <div>
            <span className="text-[var(--muted-foreground)]">Shipping: </span>
            {formatTaka(order.shippingCost)}
          </div>
        )}
        <div className="sm:col-span-2">
          <span className="text-[var(--muted-foreground)]">Created: </span>
          {new Date(order.createdAt).toLocaleString()}
        </div>
        {order.paymentMethod && (
          <div>
            <span className="text-[var(--muted-foreground)]">Payment: </span>
            <span className="font-medium">{order.paymentMethod}</span>
          </div>
        )}
        {order.paymentStrategy && (
          <div>
            <span className="text-[var(--muted-foreground)]">Payment strategy: </span>
            <span className="font-medium">{paymentStrategyLabel(order.paymentStrategy)}</span>
          </div>
        )}
        {order.transactionId && (
          <div>
            <span className="text-[var(--muted-foreground)]">Transaction ID: </span>
            <span className="font-mono font-medium">{order.transactionId}</span>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Customer</h2>
          {order.customerId && (
            <Link
              href={`/b/${businessId}/customers/${order.customerId}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              View customer
            </Link>
          )}
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted-foreground)]">Name</dt>
            <dd className="font-medium">{order.customerName}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted-foreground)]">Phone</dt>
            <dd className="font-medium">
              {order.customerPhone ? (
                <a
                  href={`tel:${order.customerPhone}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  {order.customerPhone}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--muted-foreground)]">Delivery address</dt>
            <dd className="whitespace-pre-line font-medium">{order.customerAddress || '—'}</dd>
          </div>
        </dl>
      </div>

      {nextState[order.state] && (
        <form
          action={advanceOrderStateAction.bind(null, businessId, order.id, nextState[order.state])}
          className="mt-4"
        >
          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            Advance to {nextState[order.state]}
          </Button>
        </form>
      )}

      <h2 className="mt-6 text-lg font-semibold">Edit order</h2>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <form
        id="update-order-form"
        action={updateOrderAction.bind(null, businessId, order.id)}
        className="mt-4 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Quantity</label>
            <Input
              name="count"
              type="number"
              min="1"
              defaultValue={String(order.count)}
              disabled={order.state !== 'pending'}
            />
            {order.state !== 'pending' && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Quantity can only be changed while the order is pending.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">State</label>
            <Select name="state" defaultValue={order.state}>
              <option value="pending">pending</option>
              <option value="acknowledged">acknowledged</option>
              <option value="onDelivery">onDelivery</option>
              <option value="done">done</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Customer name</label>
            <Input name="customerName" defaultValue={order.customerName} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <Input name="customerPhone" defaultValue={order.customerPhone ?? ''} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address</label>
            <Textarea name="customerAddress" rows={2} defaultValue={order.customerAddress ?? ''} />
          </div>
        </div>
      </form>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between mt-6">
        <form action={deleteOrderAction.bind(null, businessId, order.id)} className="w-full sm:w-auto">
          <Button
            type="submit"
            variant="outline"
            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 w-full"
          >
            Delete order
          </Button>
        </form>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end w-full sm:w-auto">
          <Link href={`/b/${businessId}/orders`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" form="update-order-form" className="w-full sm:w-auto">
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}
