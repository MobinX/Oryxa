import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import { createOrder, getOrderById, listOrders, updateOrderState } from '@repo/db/crud/order';
import { getProductById } from '@repo/db/crud/product';

export function registerOrderCrudTests() {
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

  it('createOrder decrements variant stock', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    expect(productDetail.variants[0]!.stock).toBe(10);

    await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 3,
      customerName: 'Buyer',
    });

    const after = await getProductById(business.id, productDetail.id);
    expect(after?.variants.find((v) => v.id === variantId)?.stock).toBe(7);
  });

  it('createOrder rejects when stock is insufficient', async () => {
    const { business, productDetail } = await seedTestWorld();
    await expect(
      createOrder({
        businessId: business.id,
        productId: productDetail.id,
        variantId: productDetail.variants[0]!.id,
        count: 99,
        customerName: 'Buyer',
      }),
    ).rejects.toThrow(/Insufficient stock/);
  });

  it('getOrderById includes product and variant names', async () => {
    const { business, productDetail } = await seedTestWorld();
    const created = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId: productDetail.variants[0]!.id,
      count: 1,
      customerName: 'Buyer',
    });
    const order = await getOrderById(business.id, created.id);
    expect(order?.productName).toBe('Test T-Shirt');
    expect(order?.variantName).toBe('Red M');
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
}
