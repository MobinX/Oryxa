import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import {
  listOrders,
  toCsv,
  csvColumnsForOrders,
  type OrderListItem,
} from '@/lib/api';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/data-table';
import { CsvDownloadButton } from '@/components/csv-download-button';
import {
  advanceOrderStateAction,
  deleteOrderAction,
  deleteOrdersBulkAction,
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

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const orders = await listOrders(token, businessId);

  const columns: Column<OrderListItem>[] = [
    {
      key: 'customerName',
      header: 'Customer',
      render: (o) => (
        <Link
          href={`/b/${businessId}/orders/${o.id}`}
          className="font-medium text-[var(--primary)] hover:underline"
        >
          {o.customerName}
        </Link>
      ),
    },
    {
      key: 'totalPrice',
      header: 'Total',
      render: (o) => `$${o.totalPrice.toFixed(2)}`,
    },
    {
      key: 'state',
      header: 'State',
      render: (o) => <Badge variant={stateVariant[o.state] ?? 'default'}>{o.state}</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (o) => (
        <span className="text-[var(--muted-foreground)]">
          {new Date(o.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const csv = toCsv(orders as unknown as Record<string, unknown>[], csvColumnsForOrders());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Orders</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{orders.length} total</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CsvDownloadButton csv={csv} filename={`orders-${businessId}.csv`} />
          <Link href={`/b/${businessId}/orders/new`}>
            <Button>New order</Button>
          </Link>
        </div>
      </div>

      <DataTable
        rows={orders}
        getRowId={(o) => o.id}
        columns={columns}
        bulkDeleteAction={deleteOrdersBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
        bulkDeleteIdField="orderIds"
        hasRowActions
        rowActions={(o) => (
          <>
            <Link
              href={`/b/${businessId}/orders/${o.id}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              View
            </Link>
            {nextState[o.state] && (
              <form
                action={advanceOrderStateAction.bind(null, businessId, o.id, nextState[o.state])}
              >
                <button
                  type="submit"
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Mark {nextState[o.state]}
                </button>
              </form>
            )}
            <form action={deleteOrderAction.bind(null, businessId, o.id)}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </form>
          </>
        )}
      />
    </div>
  );
}
