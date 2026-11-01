import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import {
  createOrder,
  getOrderById,
  getOrdersByPlatformId,
  listOrders,
  updateOrder,
  updateOrderState,
  deleteOrder,
} from '@repo/db/crud/order';
import { createProduct, getProductById } from '@repo/db/crud/product';
import { updateBusiness } from '@repo/db/crud/business';

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

  it('createOrder copies the product currency', async () => {
    const { business, productDetail } = await seedTestWorld();
    const usd = await createProduct({
      businessId: business.id,
      name: 'Dollar Item',
      price: 12,
      currency: 'USD',
      sku: `USD-ORDER-${Date.now()}`,
      variants: [{ name: 'Only', stock: 3, isAvailable: true }],
    });
    const withVariant = await getProductById(business.id, usd.id);
    const order = await createOrder({
      businessId: business.id,
      productId: usd.id,
      variantId: withVariant!.variants[0]!.id,
      count: 1,
      customerName: 'Buyer',
    });
    expect(order.currency).toBe('USD');
    expect(order.totalPrice).toBe(12);
    expect(productDetail.currency).toBe('BDT');
  });

  it('refuses an order whose method needs a transaction id, whatever door it came in through', async () => {
    const { business, productDetail } = await seedTestWorld();
    await updateBusiness(business.id, business.userId, {
      paymentMethods: [
        { name: 'bKash', info: '01712-345678', requiresTransactionId: true },
        { name: 'Nogad Agent', requiresTransactionId: true },
        { name: 'Bank transfer' },
      ],
    });
    const base = {
      businessId: business.id,
      productId: productDetail.id,
      variantId: productDetail.variants[0]?.id,
      count: 1,
      customerName: 'Buyer',
    };

    await expect(createOrder({ ...base, paymentMethod: 'bKash' })).rejects.toThrow(/transaction id/);
    // The customer's wording, not just the exact label, is what gets matched.
    await expect(createOrder({ ...base, paymentMethod: 'I will pay by BKash' })).rejects.toThrow(
      /bKash/,
    );

    const paid = await createOrder({
      ...base,
      paymentMethod: 'Nogad Agent',
      transactionId: 'TRX-777',
    });
    expect((await getOrderById(business.id, paid.id))?.transactionId).toBe('TRX-777');

    // Unmarked methods and cash on delivery stay open, and an order that names no method is
    // not blocked — a store that configured nothing behaves exactly as it did before.
    await expect(createOrder({ ...base, paymentMethod: 'Bank transfer' })).resolves.toBeTruthy();
    await expect(createOrder({ ...base, paymentMethod: 'Cash on delivery' })).resolves.toBeTruthy();
    await expect(createOrder(base)).resolves.toBeTruthy();
  });

  it('enforces the payment strategy: prepaid products refuse cash on delivery', async () => {
    const { business, productDetail } = await seedTestWorld();
    await updateBusiness(business.id, business.userId, {
      paymentMethods: [{ name: 'bKash', info: '01712-345678', requiresTransactionId: true }],
      paymentStrategy: 'full_prepaid',
    });
    const base = {
      businessId: business.id,
      productId: productDetail.id,
      variantId: productDetail.variants[0]?.id,
      count: 1,
      customerName: 'Buyer',
    };

    await expect(createOrder({ ...base, paymentMethod: 'Cash on delivery' })).rejects.toThrow(
      /Cash on delivery alone/,
    );
    await expect(createOrder({ ...base, paymentMethod: 'bKash' })).rejects.toThrow(/transaction id/);

    const paid = await createOrder({ ...base, paymentMethod: 'bKash', transactionId: 'TRX-FULL' });
    expect(paid.paymentStrategy).toBe('full_prepaid');
    expect((await getOrderById(business.id, paid.id))?.paymentStrategy).toBe('full_prepaid');
  });

  it('a product override beats the store default, in both directions', async () => {
    const { business } = await seedTestWorld();
    await updateBusiness(business.id, business.userId, {
      paymentMethods: [{ name: 'bKash', info: '01712-345678', requiresTransactionId: true }],
      paymentStrategy: 'cod',
    });
    const prepaid = await createProduct({
      businessId: business.id,
      name: 'Prepaid Only Item',
      price: 50,
      sku: `PRE-${Date.now()}`,
      paymentStrategyOverride: 'full_prepaid',
      variants: [{ name: 'Only', stock: 3, isAvailable: true }],
    });
    const prepaidDetail = await getProductById(business.id, prepaid.id);
    expect(prepaidDetail?.paymentStrategyOverride).toBe('full_prepaid');

    await expect(
      createOrder({
        businessId: business.id,
        productId: prepaid.id,
        variantId: prepaidDetail!.variants[0]!.id,
        count: 1,
        customerName: 'Buyer',
        paymentMethod: 'Cash on delivery',
      }),
    ).rejects.toThrow(/Cash on delivery alone/);

    // The other direction: a COD product in a full-prepaid store orders with nothing up front.
    await updateBusiness(business.id, business.userId, { paymentStrategy: 'full_prepaid' });
    const codItem = await createProduct({
      businessId: business.id,
      name: 'Pay Later Item',
      price: 20,
      sku: `COD-${Date.now()}`,
      paymentStrategyOverride: 'cod',
      variants: [{ name: 'Only', stock: 3, isAvailable: true }],
    });
    const codDetail = await getProductById(business.id, codItem.id);
    const order = await createOrder({
      businessId: business.id,
      productId: codItem.id,
      variantId: codDetail!.variants[0]!.id,
      count: 1,
      customerName: 'Buyer',
      paymentMethod: 'Cash on delivery',
    });
    expect(order.paymentStrategy).toBe('cod');
  });

  it('delivery prepaid collects only the delivery charge before ordering', async () => {
    const { business, productDetail } = await seedTestWorld();
    await updateBusiness(business.id, business.userId, {
      paymentMethods: [{ name: 'bKash', info: '01712-345678', requiresTransactionId: true }],
      paymentStrategy: 'delivery_prepaid',
    });
    const base = {
      businessId: business.id,
      productId: productDetail.id,
      variantId: productDetail.variants[0]?.id,
      count: 1,
      customerName: 'Buyer',
      shippingCost: 60,
    };

    await expect(createOrder({ ...base, paymentMethod: 'Cash on delivery' })).rejects.toThrow(
      /delivery charge/,
    );
    const paid = await createOrder({ ...base, paymentMethod: 'bKash', transactionId: 'TRX-DEL' });
    expect(paid.paymentStrategy).toBe('delivery_prepaid');

    // With no delivery charge there is nothing to prepay, so COD orders again.
    await expect(
      createOrder({ ...base, shippingCost: 0, paymentMethod: 'Cash on delivery' }),
    ).resolves.toBeTruthy();
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

  it('getOrdersByPlatformId reads one customer\'s orders and nobody else\'s', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const place = (psid: string | undefined, count: number) =>
      createOrder({
        businessId: business.id,
        productId: productDetail.id,
        variantId,
        count,
        customerName: 'Buyer',
        ...(psid ? { customerPlatformId: psid } : {}),
      });

    const mine = await place('psid-mine', 1);
    const alsoMine = await place('psid-mine', 2);
    const theirs = await place('psid-theirs', 3);
    const noMessenger = await place(undefined, 4); // a dashboard order: nobody's history

    const forMe = await getOrdersByPlatformId(business.id, 'psid-mine');
    expect(forMe.orders.map((o) => o.id).sort()).toEqual([mine.id, alsoMine.id].sort());
    expect(forMe.hasMore).toBe(false);

    const forThem = await getOrdersByPlatformId(business.id, 'psid-theirs');
    expect(forThem.orders.map((o) => o.id)).toEqual([theirs.id]);

    // An id that matches nothing returns nothing — including the orders that carry no id at all.
    expect((await getOrdersByPlatformId(business.id, 'psid-nobody')).orders).toEqual([]);
    expect((await getOrdersByPlatformId(business.id, '')).orders).toEqual([]);
    expect((await getOrdersByPlatformId(business.id, '   ')).orders).toEqual([]);
    void noMessenger;
  });

  it('getOrdersByPlatformId pages without repeating or dropping an order', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const order = await createOrder({
        businessId: business.id,
        productId: productDetail.id,
        variantId,
        count: 1,
        customerName: 'Buyer',
        customerPlatformId: 'psid-paged',
      });
      ids.push(order.id);
    }

    // Two pages of two. Which order is "newest" is not asserted: all four land in the same clock tick,
    // and a tie is broken by the database, not by the code under test.
    const first = await getOrdersByPlatformId(business.id, 'psid-paged', { offset: 0, limit: 2 });
    const second = await getOrdersByPlatformId(business.id, 'psid-paged', { offset: 2, limit: 2 });
    const third = await getOrdersByPlatformId(business.id, 'psid-paged', { offset: 4, limit: 2 });

    expect(first.orders).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(second.orders).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(third.orders).toHaveLength(0);
    expect(third.hasMore).toBe(false);

    const seen = [...first.orders, ...second.orders].map((o) => o.id).sort();
    expect(seen).toEqual([...ids].sort());

    // A page wider than one Messenger card list can hold is cut, not sent and truncated by luck.
    const capped = await getOrdersByPlatformId(business.id, 'psid-paged', { offset: 0, limit: 50 });
    expect(capped.orders).toHaveLength(4);
  });

  it('a deleted order leaves the customer\'s history', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    const kept = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 1,
      customerName: 'Buyer',
      customerPlatformId: 'psid-cancelled',
    });
    const removed = await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 1,
      customerName: 'Buyer',
      customerPlatformId: 'psid-cancelled',
    });
    await deleteOrder(business.id, removed.id);

    const page = await getOrdersByPlatformId(business.id, 'psid-cancelled');
    expect(page.orders.map((o) => o.id)).toEqual([kept.id]);
  });

  it('an order carries the product and price the history card needs', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    await createOrder({
      businessId: business.id,
      productId: productDetail.id,
      variantId,
      count: 2,
      customerName: 'Buyer',
      customerPlatformId: 'psid-shape',
    });

    const page = await getOrdersByPlatformId(business.id, 'psid-shape');
    expect(page.orders[0]).toMatchObject({
      productName: productDetail.name,
      count: 2,
      totalPrice: expect.any(Number),
      state: 'pending',
    });
    expect(page.orders[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('an order that never chose a size still shows the product\'s photo', async () => {
    const { business } = await seedTestWorld();
    const product = await createProduct({
      businessId: business.id,
      name: 'Fallback Shirt',
      price: 30,
      sku: `FBK-${Date.now()}`,
      description: 'Ordered while no size was recorded',
      variants: [
        { name: 'S', stock: 4, isAvailable: true, price: 30, imageUrl: 'https://cdn.test/fbk-s.jpg' },
        { name: 'M', stock: 4, isAvailable: true, price: 30 },
      ],
    });

    // Two sizes and no choice made, so the row is written with variant_id NULL. That is the shape a
    // customer's own history has to survive: only a variant carries a photo, and a history read that
    // could not see past the order row dropped these orders off the list of things they bought.
    const order = await createOrder({
      businessId: business.id,
      productId: product.id,
      count: 1,
      customerName: 'Buyer',
      customerPlatformId: 'psid-fallback',
    });

    const page = await getOrdersByPlatformId(business.id, 'psid-fallback');
    expect(page.orders.map((o) => o.id)).toEqual([order.id]);
    expect(page.orders[0]!.variantName).toBeNull();
    expect(page.orders[0]!.productName).toBe('Fallback Shirt');
    expect(page.orders[0]!.imageUrl).toBe('https://cdn.test/fbk-s.jpg');
  });

  it('an order whose product has no photo anywhere reports none rather than a wrong one', async () => {
    const { business } = await seedTestWorld();
    const product = await createProduct({
      businessId: business.id,
      name: 'Bare Towel',
      price: 12,
      sku: `BARE-${Date.now()}`,
      description: 'The store never photographed it',
      variants: [{ name: 'One', stock: 2, isAvailable: true, price: 12 }],
    });
    await createOrder({
      businessId: business.id,
      productId: product.id,
      count: 1,
      customerName: 'Buyer',
      customerPlatformId: 'psid-bare',
    });

    const page = await getOrdersByPlatformId(business.id, 'psid-bare');
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]!.imageUrl).toBeNull();
  });
}
