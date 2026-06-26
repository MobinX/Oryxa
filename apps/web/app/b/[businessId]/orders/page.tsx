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
import { DataTable, type DataTableHeader } from '@/components/data-table';
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

const headers: DataTableHeader[] = [
  { key: 'customerName', header: 'Customer' },
  { key: 'totalPrice', header: 'Total' },
  { key: 'state', header: 'State' },
  { key: 'createdAt', header: 'Date' },
];

function orderRowActions(businessId: string, order: OrderListItem) {
  return (
    <>
      <Link
        href={`/b/${businessId}/orders/${order.id}`}
        className="text-sm text-[var(--primary)] hover:underline"
      >
        View
      </Link>
      {nextState[order.state] && (
        <form
          action={advanceOrderStateAction.bind(null, businessId, order.id, nextState[order.state])}
        >
          <button type="submit" className="text-sm text-[var(--primary)] hover:underline">
            Mark {nextState[order.state]}
          </button>
        </form>
      )}
      <form action={deleteOrderAction.bind(null, businessId, order.id)}>
        <button type="submit" className="text-sm text-red-600 hover:underline">
          Delete
        </button>
      </form>
    </>
  );
}

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const orders = await listOrders(token, businessId);

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
        headers={headers}
        rows={tableRows}
        bulkDeleteAction={deleteOrdersBulkAction.bind(null, businessId) as unknown as (fd: FormData) => Promise<void>}
        bulkDeleteIdField="orderIds"
        hasRowActions
      />
    </div>
  );
}
