import { requireAuth } from '@/lib/auth';
import { listOrders } from '@/lib/api';
import { Badge } from '@/components/ui/card';
import { advanceOrderStateAction } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';

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

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Orders</h1>
      <div className="mt-6 table-wrap rounded-xl border border-[var(--border)] bg-white sm:mt-8">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">State</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-[var(--border)]">
                <td className="px-4 py-3">{order.customerName}</td>
                <td className="px-4 py-3">${order.totalPrice.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Badge variant={stateVariant[order.state] ?? 'default'}>{order.state}</Badge>
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">
                  {new Date(order.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {nextState[order.state] && (
                    <form
                      action={advanceOrderStateAction.bind(
                        null,
                        businessId,
                        order.id,
                        nextState[order.state],
                      )}
                    >
                      <Button type="submit" variant="ghost" className="h-auto p-0 text-sm text-[var(--primary)]">
                        Mark {nextState[order.state]}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="p-8 text-center text-[var(--muted-foreground)]">No orders yet.</p>
        )}
      </div>
    </div>
  );
}
