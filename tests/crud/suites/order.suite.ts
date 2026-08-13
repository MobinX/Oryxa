import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import {
  createOrder,
  getOrderById,
  listOrders,
  updateOrder,
  updateOrderState,
  deleteOrder,
} from '@repo/db/crud/order';
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

  it('updateOrder adjusts stock when quantity changes on a pending order', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const order = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 2,
      customerName: 'Buyer',
    });

    await updateOrder(business.id, order.id, { count: 4 });
    const afterIncrease = await getProductById(business.id, productDetail.id);
    expect(afterIncrease?.variants.find((v) => v.id === variantId)?.stock).toBe(6);

    await updateOrder(business.id, order.id, { count: 1 });
    const afterDecrease = await getProductById(business.id, productDetail.id);
    expect(afterDecrease?.variants.find((v) => v.id === variantId)?.stock).toBe(9);
  });

  it('updateOrder rejects quantity changes on fulfilled orders', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const order = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 2,
      customerName: 'Buyer',
    });
    await updateOrderState(business.id, order.id, { state: 'done' });

    await expect(updateOrder(business.id, order.id, { count: 5 })).rejects.toThrow(
      /pending orders/,
    );

    const after = await getProductById(business.id, productDetail.id);
    expect(after?.variants.find((v) => v.id === variantId)?.stock).toBe(8);
    const unchanged = await getOrderById(business.id, order.id);
    expect(unchanged?.count).toBe(2);
  });

  it('deleteOrder restores stock for pending orders', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const order = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 3,
      customerName: 'Buyer',
    });

    await deleteOrder(business.id, order.id);

    const after = await getProductById(business.id, productDetail.id);
    expect(after?.variants.find((v) => v.id === variantId)?.stock).toBe(10);
  });

  it('deleteOrder does not restore stock for fulfilled orders', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const order = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 3,
      customerName: 'Buyer',
    });
    await updateOrderState(business.id, order.id, { state: 'done' });

    await deleteOrder(business.id, order.id);

    const after = await getProductById(business.id, productDetail.id);
    expect(after?.variants.find((v) => v.id === variantId)?.stock).toBe(7);
  });
}
