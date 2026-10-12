import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { cachedCustomer } from '@/app/_cache/queries';
import { Card, Badge } from '@/components/ui/card';
import { DataTable, type DataTableHeader } from '@/components/data-table';

const stateVariant: Record<string, 'warning' | 'info' | 'purple' | 'success'> = {
  pending: 'warning',
  acknowledged: 'info',
  onDelivery: 'purple',
  done: 'success',
};

const orderHeaders: DataTableHeader[] = [
  { key: 'placed', header: 'Placed', className: 'whitespace-nowrap text-[var(--muted-foreground)]' },
  { key: 'store', header: 'Store', className: 'hidden md:table-cell text-[var(--muted-foreground)]' },
  { key: 'item', header: 'Item', className: 'w-full min-w-[180px]' },
  { key: 'count', header: 'Qty', className: 'text-[var(--muted-foreground)]' },
  { key: 'total', header: 'Total', className: 'whitespace-nowrap' },
  { key: 'state', header: 'State', className: 'whitespace-nowrap' },
];

const purchaseHeaders: DataTableHeader[] = [
  { key: 'product', header: 'Product', className: 'w-full min-w-[180px]' },
  { key: 'orders', header: 'Times bought', className: 'whitespace-nowrap' },
  { key: 'units', header: 'Units', className: 'text-[var(--muted-foreground)]' },
  { key: 'spent', header: 'Spent', className: 'whitespace-nowrap' },
  { key: 'span', header: 'First → last', className: 'hidden md:table-cell whitespace-nowrap text-[var(--muted-foreground)]' },
];

/**
 * Every string here is drawn on the server before the merchant's browser takes over, so
 * dates are pinned to a locale and to UTC — the runtime's own clock and the reader's differ
 * by a day more often than either would admit, and each differing character is a hydration
 * failure that throws the page away. The suffix says which clock the reader is reading.
 */
function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })} · ${d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })} UTC`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const { businessId } = await params;
  return (
    <div className="space-y-6">
      {/* An absolute href: a relative ".." from /customers/<id> lands on /b/<businessId>, which
          is a layout with no page of its own. */}
      <Link
        href={`/b/${businessId}/customers`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        ← Back to customers
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />}>
        <History params={params} />
      </Suspense>
    </div>
  );
}

async function History({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const { businessId, customerId } = await params;
  const token = await requireAuth();
  const history = await cachedCustomer(token, businessId, customerId);
  if (!history) notFound();

  const { customer, orders, purchases, stats } = history;
  const repeats = purchases.filter((p) => p.orders > 1);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{customer.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {orders.length === 0
                ? 'On the books, but nothing ordered yet.'
                : `${stats.orders} order${stats.orders === 1 ? '' : 's'} across ${
                    new Set(orders.map((o) => o.businessId)).size
                  } store${new Set(orders.map((o) => o.businessId)).size === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right sm:gap-6">
            <div>
              <p className="text-lg font-bold sm:text-xl">{money(stats.spent)}</p>
              <p className="text-xs text-[var(--muted-foreground)]">Spent</p>
            </div>
            <div>
              <p className="text-lg font-bold sm:text-xl">{stats.units}</p>
              <p className="text-xs text-[var(--muted-foreground)]">Units</p>
            </div>
            <div>
              <p className="text-lg font-bold sm:text-xl">{purchases.length}</p>
              <p className="text-xs text-[var(--muted-foreground)]">Products</p>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <Detail label="Phone" value={customer.phone} />
          <Detail label="Email" value={customer.email} />
          <Detail label="Address" value={customer.address} />
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              First seen
            </dt>
            <dd className="mt-1 text-sm">
              {stats.firstOrderedAt ? day(stats.firstOrderedAt) : '—'}
              {stats.lastOrderedAt && (
                <span className="text-[var(--muted-foreground)]">
                  {' '}
                  · last order {day(stats.lastOrderedAt)}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        {orders.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-[var(--muted-foreground)]">
              No orders under this number yet. They appear here as soon as one is placed —
              from the dashboard, the storefront, or an agent.
            </p>
          </Card>
        ) : (
          <DataTable
            headers={orderHeaders}
            hasRowActions
            rows={orders.map((order) => ({
              id: order.id,
              cells: [
                <span key="placed" className="font-normal">
                  {stamp(order.createdAt)}
                </span>,
                <span key="store" className="font-normal">
                  {order.storeName}
                </span>,
                <div key="item" className="min-w-0">
                  <p className="truncate">{order.productName ?? 'Product removed'}</p>
                  {order.variantName && (
                    <p className="truncate text-xs font-normal text-[var(--muted-foreground)]">
                      {order.variantName} · {money(order.unitPrice)} each
                    </p>
                  )}
                </div>,
                order.count,
                <span key="total">{money(order.totalPrice)}</span>,
                <Badge key="state" variant={stateVariant[order.state] ?? 'default'}>
                  {order.state}
                </Badge>,
              ],
              actions: (
                <Link
                  href={`/b/${businessId}/orders/${order.id}`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Open
                </Link>
              ),
            }))}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">What they buy</h2>
          {repeats.length > 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {repeats.length} bought more than once
            </p>
          )}
        </div>
        {purchases.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-[var(--muted-foreground)]">Nothing purchased yet.</p>
          </Card>
        ) : (
          <DataTable
            headers={purchaseHeaders}
            rows={purchases.map((purchase) => ({
              id: purchase.productId,
              cells: [
                <div key="product" className="min-w-0">
                  <p className="truncate">{purchase.productName}</p>
                  {purchase.orders > 1 && (
                    <p className="text-xs font-normal text-[var(--muted-foreground)]">
                      Repeat: {purchase.orders} separate orders
                    </p>
                  )}
                </div>,
                purchase.orders > 1 ? (
                  <Badge key="orders" variant="purple">
                    {purchase.orders}×
                  </Badge>
                ) : (
                  purchase.orders
                ),
                purchase.units,
                <span key="spent">{money(purchase.spent)}</span>,
                <span key="span" className="font-normal">
                  {day(purchase.firstOrderedAt)} → {day(purchase.lastOrderedAt)}
                </span>,
              ],
            }))}
          />
        )}
      </section>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value || '—'}</dd>
    </div>
  );
}
