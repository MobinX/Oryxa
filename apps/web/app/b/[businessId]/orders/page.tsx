'use client';

import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { listOrders, updateOrderState } from '@/lib/api';
import { Badge } from '@/components/ui/card';

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

export default function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = use(params);
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => listOrders(token!, businessId),
    enabled: !!token,
    refetchInterval: 10000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>
      {isLoading ? (
        <p className="mt-8">Loading...</p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
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
              {orders?.map((order) => (
                <tr key={order.id} className="border-b border-[var(--border)]">
                  <td className="px-4 py-3">{order.customerName}</td>
                  <td className="px-4 py-3">${order.totalPrice.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={stateVariant[order.state] ?? 'default'}>
                      {order.state}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {nextState[order.state] && (
                      <button
                        className="text-sm text-[var(--primary)] hover:underline"
                        onClick={async () => {
                          await updateOrderState(token!, businessId, order.id, nextState[order.state]);
                          queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
                        }}
                      >
                        Mark {nextState[order.state]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders?.length === 0 && (
            <p className="p-8 text-center text-[var(--muted-foreground)]">No orders yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
