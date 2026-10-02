import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness, updateBusiness } from '@repo/db/crud/business';
import { createProduct } from '@repo/db/crud/product';

async function makePublishedStore(slug: string) {
  const user = await syncUser({
    firebaseUid: `store-${slug}-${Date.now()}`,
    name: 'Owner',
    signInMethod: 'google',
  });
  const biz = await createBusiness(user.id, { name: 'Book Nook' });
  await updateBusiness(biz.id, user.id, { slug, storePublished: true });
  const stamp = Date.now();
  const dune = await createProduct({
    businessId: biz.id,
    name: 'Dune',
    price: 20,
    sku: `DUNE-${stamp}`,
    categoryName: 'Fiction',
    variants: [{ name: 'Paperback', stock: 5, isAvailable: true }],
  });
  const hamlet = await createProduct({
    businessId: biz.id,
    name: 'Hamlet',
    price: 9.5,
    sku: `HAM-${stamp}`,
    categoryName: 'Plays',
    variants: [{ name: 'Hardcover', stock: 2, isAvailable: true }],
  });
  return { user, biz, dune, hamlet };
}

describe('Public Storefront API', () => {
  withPglite();

  it('returns published store with products + categories', async () => {
    await makePublishedStore('shop-a');
    const res = await app.request('/api/v1/store/shop-a');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Book Nook');
    expect(body.products.map((p: { name: string }) => p.name).sort()).toEqual(['Dune', 'Hamlet']);
    expect(body.categories.sort()).toEqual(['Fiction', 'Plays']);
  });

  it('search, category, price filter and sort', async () => {
    await makePublishedStore('shop-b');
    const q = await (await app.request('/api/v1/store/shop-b?q=dune')).json();
    expect(q.products).toHaveLength(1);
    expect(q.products[0].name).toBe('Dune');

    const cat = await (await app.request('/api/v1/store/shop-b?category=Plays')).json();
    expect(cat.products.map((p: { name: string }) => p.name)).toEqual(['Hamlet']);

    const max = await (await app.request('/api/v1/store/shop-b?max=10')).json();
    expect(max.products.map((p: { name: string }) => p.name)).toEqual(['Hamlet']);

    const asc = await (await app.request('/api/v1/store/shop-b?sort=price_asc')).json();
    expect(asc.products[0].name).toBe('Hamlet');
  });

  it('product detail returns variants', async () => {
    const { dune } = await makePublishedStore('shop-c');
    const res = await app.request(`/api/v1/store/shop-c/products/${dune.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Dune');
    expect(body.variants).toHaveLength(1);
  });

  it('404 for unknown or unpublished store', async () => {
    const missing = await app.request('/api/v1/store/does-not-exist');
    expect(missing.status).toBe(404);

    const user = await syncUser({ firebaseUid: `unpub-${Date.now()}`, name: 'X', signInMethod: 'google' });
    const biz = await createBusiness(user.id, { name: 'Hidden' });
    await updateBusiness(biz.id, user.id, { slug: 'hidden-shop' }); // no storePublished
    const res = await app.request('/api/v1/store/hidden-shop');
    expect(res.status).toBe(404);
  });

  it('checkout creates a pending order with server-computed total', async () => {
    const { dune } = await makePublishedStore('shop-d');
    const res = await app.request('/api/v1/store/shop-d/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Buyer',
        customerPhone: '01700',
        items: [{ productId: dune.id, quantity: 2 }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.total).toBe(40); // 20 * 2, computed server-side
    expect(body.status).toBe('pending');
    expect(body.orderIds).toHaveLength(1);
  });

  it('checkout rejects insufficient stock and unknown product', async () => {
    const { hamlet, dune } = await makePublishedStore('shop-e');
    const stock = await app.request('/api/v1/store/shop-e/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'B', items: [{ productId: hamlet.id, quantity: 5 }] }),
    });
    expect(stock.status).toBe(400);
    expect((await stock.json()).error).toMatch(/stock/i);

    const unknown = await app.request('/api/v1/store/shop-e/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'B',
        items: [{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      }),
    });
    expect(unknown.status).toBe(400);
    void dune;
  });

  it('checkout cannot order another store product (cross-store isolation)', async () => {
    const a = await makePublishedStore('shop-f');
    await makePublishedStore('shop-g');
    const res = await app.request('/api/v1/store/shop-g/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'B', items: [{ productId: a.dune.id, quantity: 1 }] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not found/i);
  });
});
