import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createOrder, listOrders, updateOrderState } from '@repo/db/crud/order';

describe('Order CRUD', () => {
  withPglite();

  it('createOrder computes total price', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]?.id;
    const order = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 2,
      customerName: 'Buyer',
      customerPhone: '555-1234',
    });
    expect(order.totalPrice).toBe(59.98);
    expect(order.state).toBe('pending');
  });

  it('createOrder throws for missing product', async () => {
    const { business } = await seedTestWorld();
    await expect(
      createOrder({
        businessId: business.id,
        productId: '00000000-0000-0000-0000-000000000000',
        count: 1,
        customerName: 'Buyer',
      }),
    ).rejects.toThrow('Product not found');
  });

  it('listOrders filters by state', async () => {
    const seed = await seedTestWorld();
    await createOrder({
      businessId: seed.business.id,
      productId: seed.productDetail.id,
      count: 1,
      customerName: 'Buyer',
    });
    const orders = await listOrders(seed.business.id, { state: 'pending' });
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].state).toBe('pending');
  });

  it('updateOrderState progresses order', async () => {
    const seed = await seedTestWorld();
    const order = await createOrder({
      businessId: seed.business.id,
      productId: seed.productDetail.id,
      count: 1,
      customerName: 'Buyer',
    });
    const result = await updateOrderState(seed.business.id, order.id, { state: 'acknowledged' });
    expect(result?.newState).toBe('acknowledged');
  });

  it('updateOrderState returns null for unknown order', async () => {
    const { business } = await seedTestWorld();
    const result = await updateOrderState(business.id, '00000000-0000-0000-0000-000000000000', {
      state: 'done',
    });
    expect(result).toBeNull();
  });
});
