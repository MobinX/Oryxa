import Link from 'next/link';
import { Suspense } from 'react';
import { Eye, CheckCircle2, Trash2 } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { cachedOrders } from '@/app/_cache/queries';
import { toCsv, csvColumnsForOrders, type OrderListItem } from '@/lib/api';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableHeader } from '@/components/data-table';
import { CsvDownloadButton } from '@/components/csv-download-button';
import {
  advanceOrderStateAction,
  deleteOrderAction,
  deleteOrdersBulkAction,
} from '@/app/actions/orders';
import OrdersSkeleton from './skeleton';

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

const headers: DataTableHeader[] = [
  { key: 'customerName', header: 'Customer', className: 'w-full min-w-[150px]' },
  { key: 'totalPrice', header: 'Total' },
  { key: 'state', header: 'State' },
  { key: 'createdAt', header: 'Date' },
];

function orderRowActions(businessId: string, order: OrderListItem) {
  return (
    <>
      <Link
        href={`/b/${businessId}/orders/${order.id}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline font-semibold"
        title="View"
      >
        <Eye className="h-4 w-4" /> <span className="hidden sm:inline">View</span>
      </Link>
      {nextState[order.state] && (
        <form
          action={advanceOrderStateAction.bind(null, businessId, order.id, nextState[order.state])}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline font-semibold"
            title={`Mark ${nextState[order.state]}`}
          >
            <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Mark {nextState[order.state]}</span>
          </button>
        </form>
      )}
      <form action={deleteOrderAction.bind(null, businessId, order.id)}>
        <button
          type="submit"
          className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline font-semibold"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
        </button>
      </form>
    </>
  );
}

export default function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Orders</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            <Suspense fallback="…">
              <OrderCount params={params} />
            </Suspense>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />}>
            <OrderCsv params={params} />
          </Suspense>
          <Link href="new">
            <Button>New order</Button>
          </Link>
        </div>
      </div>
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersContent params={params} />
      </Suspense>
    </div>
  );
}

async function OrdersContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const orders = await cachedOrders(token, businessId);

  const tableRows = orders.map((order) => ({
    id: order.id,
    cells: [
      <Link
        key="customer"
        href={`/b/${businessId}/orders/${order.id}`}
        className="font-medium text-[var(--primary)] hover:underline"
      >
        {order.customerName}
      </Link>,
      `$${order.totalPrice.toFixed(2)}`,
      <Badge key="state" variant={stateVariant[order.state] ?? 'default'}>
        {order.state}
      </Badge>,
      <span key="date" className="text-[var(--muted-foreground)]">
        {new Date(order.createdAt).toLocaleDateString()}
      </span>,
    ],
    actions: orderRowActions(businessId, order),
  }));

  return (
    <DataTable
      headers={headers}
      rows={tableRows}
      bulkDeleteAction={deleteOrdersBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
      bulkDeleteIdField="orderIds"
      hasRowActions
    />
  );
}

async function OrderCount({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const token = await requireAuth();
  const orders = await cachedOrders(token, businessId);
  return <>{orders.length} total</>;
}

async function OrderCsv({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const token = await requireAuth();
  const orders = await cachedOrders(token, businessId);
  const csv = toCsv(orders as unknown as Record<string, unknown>[], csvColumnsForOrders());
  return <CsvDownloadButton csv={csv} filename={`orders-${businessId}.csv`} />;
}

