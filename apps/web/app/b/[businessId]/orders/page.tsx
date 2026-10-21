import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { cachedOrders, cachedProducts } from '@/app/_cache/queries';
import { OrdersProductsWorkspace } from '@/components/orders-products-workspace';
import OrdersSkeleton from './skeleton';

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersContent params={params} />
    </Suspense>
  );
}

async function OrdersContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const token = await requireAuth();
  const [orders, productsRes] = await Promise.all([
    cachedOrders(token, businessId).catch(() => []),
    cachedProducts(token, businessId, { limit: 20 }).catch(() => ({ products: [], totalCount: 0 })),
  ]);

  return (
    <OrdersProductsWorkspace
      businessId={businessId}
      initialOrders={orders}
      initialProducts={productsRes.products}
    />
  );
}
