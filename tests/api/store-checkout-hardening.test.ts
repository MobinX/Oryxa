import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '@api/lib/rate-limit';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness, updateBusiness } from '@repo/db/crud/business';
import { createProduct } from '@repo/db/crud/product';
import { createOrder } from '@repo/db/crud/order';

async function store(slug: string) {
  const user = await syncUser({ firebaseUid: `h-${slug}-${Date.now()}`, name: 'Owner', signInMethod: 'google' });
  const biz = await createBusiness(user.id, { name: 'Hardening' });
  await updateBusiness(biz.id, user.id, { slug, storePublished: true });
  const stamp = Date.now();
  const shirt = await createProduct({
    businessId: biz.id,
    name: 'Shirt',
    price: 10,
    sku: `SH-${stamp}`,
    categoryName: 'Wear',
    variants: [
      { name: 'S', stock: 1, isAvailable: true },
      { name: 'L', stock: 1, isAvailable: true },
    ],
  });
  const mug = await createProduct({
    businessId: biz.id,
    name: 'Mug',
    price: 5,
    sku: `MUG-${stamp}`,
    categoryName: 'Home',
    variants: [{ name: 'One', stock: 3, isAvailable: true }],
  });
  return { biz, shirt, mug };
}

const checkout = (slug: string, items: unknown[], ip = `203.0.113.${slug.length}-${slug}`) =>
  app.request(`/api/v1/store/${slug}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ customerName: 'Buyer', customerPhone: '01711111111', items }),
  });

describe('checkout hardening', () => {
  withPglite();

  it('refuses a multi-variant product without a variant id (no unlimited base-price sale)', async () => {
    const { shirt } = await store('hard-a');
    const res = await checkout('hard-a', [{ productId: shirt.id, quantity: 50 }]);
    expect(res.status).toBe(400);
  });

  it('still auto-picks the only variant and checks its stock', async () => {
    const { mug } = await store('hard-b');
    expect((await checkout('hard-b', [{ productId: mug.id, quantity: 2 }])).status).toBe(201);
    expect((await checkout('hard-b', [{ productId: mug.id, quantity: 5 }])).status).toBe(400);
  });

  it('leaves nothing behind when a later cart line fails (same variant over-ordered)', async () => {
    const { mug } = await store('hard-e');
    const res = await checkout('hard-e', [
      { productId: mug.id, quantity: 2 },
      { productId: mug.id, quantity: 2 },
    ]);
    expect(res.status).toBe(400);
    // all 3 units still available: no partial order consumed stock
    expect((await checkout('hard-e', [{ productId: mug.id, quantity: 3 }])).status).toBe(201);
  });

  it('caps the authenticated create count at 999', async () => {
    const { biz, mug } = await store('hard-c');
    await expect(
      createOrder({ businessId: biz.id, productId: mug.id, count: 1000, customerName: 'X' }),
    ).rejects.toThrow();
  });

  it('rate limiter: 11th hit in a window is limited, other keys and later windows are not', () => {
    const limited = createRateLimiter(10, 60_000);
    const t0 = 1_000_000;
    const results = Array.from({ length: 12 }, (_, i) => limited('1.2.3.4|shop', t0 + i));
    expect(results.slice(0, 10).every((r) => r === false)).toBe(true);
    expect(results.slice(10)).toEqual([true, true]);
    expect(limited('5.6.7.8|shop', t0 + 20)).toBe(false);
    expect(limited('1.2.3.4|shop', t0 + 61_000)).toBe(false);
  });

});
