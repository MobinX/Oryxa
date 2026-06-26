import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getOrder } from '@/lib/api';
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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
}) {
  const { businessId, orderId } = await params;
  const token = await requireAuth();

  let order;
  try {
    order = await getOrder(token, businessId, orderId);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/b/${businessId}/orders`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to orders
      </Link>
      <Card className="mt-4 sm:mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Order {order.id.slice(0, 8)}</h1>
          <Badge variant={stateVariant[order.state] ?? 'default'}>{order.state}</Badge>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg bg-[var(--muted)] p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-[var(--muted-foreground)]">Total: </span>
            <strong>${order.totalPrice.toFixed(2)}</strong>
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Unit price: </span>
            ${order.variantPrice.toFixed(2)} × {order.count}
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Product: </span>
            {order.productId ?? '—'}
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Variant: </span>
            {order.variantId ?? '—'}
          </div>
          <div className="sm:col-span-2">
            <span className="text-[var(--muted-foreground)]">Created: </span>
            {new Date(order.createdAt).toLocaleString()}
          </div>
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
        <form action={updateOrderAction.bind(null, businessId, order.id)} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <Input name="count" type="number" min="1" defaultValue={String(order.count)} />
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

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-between">
            <form action={deleteOrderAction.bind(null, businessId, order.id)}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete order
              </button>
            </form>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link
                href={`/b/${businessId}/orders`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium hover:bg-[var(--muted)]"
              >
                Cancel
              </Link>
              <Button type="submit">Save changes</Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
