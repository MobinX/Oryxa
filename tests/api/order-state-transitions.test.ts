import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

describe('Order State Transitions', () => {
  withPglite();

  it('valid chain: pending->acknowledged->onDelivery->done returns 200', async () => {
    const seed = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${seed.business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: seed.productDetail.id,
        count: 1,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;
    expect(order.state).toBe('pending');

    // pending -> acknowledged
    let res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });
    expect(res.status).toBe(200);
    const acked = await res.json() as any;
    expect(acked.newState).toBe('acknowledged');

    // acknowledged -> onDelivery
    res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'onDelivery' }),
    });
    expect(res.status).toBe(200);
    const delivery = await res.json() as any;
    expect(delivery.newState).toBe('onDelivery');

    // onDelivery -> done
    res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'done' }),
    });
    expect(res.status).toBe(200);
    const done = await res.json() as any;
    expect(done.newState).toBe('done');
  });

  it('invalid transition: done->pending returns 409', async () => {
    const seed = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${seed.business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: seed.productDetail.id,
        count: 1,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // First advance to done
    await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'done' }),
    });

    // Then try done -> pending
    const res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'pending' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error).toContain('Invalid state transition');
    expect(body.allowed).toEqual([]);
  });

  it('delete after onDelivery does not restock', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;
    
    // Check initial stock
    const beforeCreate = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productBefore = await beforeCreate.json() as any;
    const initialStock = productBefore.variants.find((v: any) => v.id === variantId)?.stock;

    // Create order
    const createRes = await app.request(`/api/v1/${business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: productDetail.id,
        variantId,
        count: 2,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // Advance to onDelivery (not done)
    await app.request(`/api/v1/${business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'onDelivery' }),
    });

    // Delete order - should NOT restock since state is onDelivery
    const deleteRes = await app.request(`/api/v1/${business.id}/orders/${order.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(200);

    // Verify stock unchanged (still decremented)
    const afterDelete = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productAfter = await afterDelete.json() as any;
    const finalStock = productAfter.variants.find((v: any) => v.id === variantId)?.stock;
    expect(finalStock).toBe(initialStock - 2);
  });

  it('delete pending order restocks once', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;

    // Check initial stock
    const beforeRes = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productBefore = await beforeRes.json() as any;
    const initialStock = productBefore.variants.find((v: any) => v.id === variantId)?.stock;

    // Create order
    const createRes = await app.request(`/api/v1/${business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: productDetail.id,
        variantId,
        count: 3,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // Delete while pending - SHOULD restock
    const deleteRes = await app.request(`/api/v1/${business.id}/orders/${order.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(200);

    // A repeated delete must not restock a second time
    const again = await app.request(`/api/v1/${business.id}/orders/${order.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(again.status).toBe(404);

    // Verify stock restored exactly once
    const afterDelete = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productAfter = await afterDelete.json() as any;
    const finalStock = productAfter.variants.find((v: any) => v.id === variantId)?.stock;
    expect(finalStock).toBe(initialStock);
  });

  it('re-submitting the current state is a no-op (200)', async () => {
    const { business, productDetail } = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ productId: productDetail.id, variantId: productDetail.variants[0]!.id, count: 1, customerName: 'Same' }),
    });
    const order = await createRes.json() as any;
    const res = await app.request(`/api/v1/${business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'pending' }),
    });
    expect(res.status).toBe(200);
  });

  it('acknowledged->onDelivery works', async () => {
    const seed = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${seed.business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: seed.productDetail.id,
        count: 1,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // pending -> acknowledged
    await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });

    // acknowledged -> onDelivery
    const res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'onDelivery' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.newState).toBe('onDelivery');
  });

  it('acknowledged->pending works (revert)', async () => {
    const seed = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${seed.business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: seed.productDetail.id,
        count: 1,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // pending -> acknowledged
    await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });

    // acknowledged -> pending (revert allowed)
    const res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'pending' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.newState).toBe('pending');
  });

  it('onDelivery->acknowledged works (revert)', async () => {
    const seed = await seedTestWorld();
    const createRes = await app.request(`/api/v1/${seed.business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: seed.productDetail.id,
        count: 1,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    // pending -> onDelivery (via acknowledged)
    await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });
    await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'onDelivery' }),
    });

    // onDelivery -> acknowledged (revert allowed)
    const res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.newState).toBe('acknowledged');
  });

  it('delete acknowledged order restocks', async () => {
    const { business, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]!.id;

    const beforeRes = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productBefore = await beforeRes.json() as any;
    const initialStock = productBefore.variants.find((v: any) => v.id === variantId)?.stock;

    // Create and acknowledge order
    const createRes = await app.request(`/api/v1/${business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: productDetail.id,
        variantId,
        count: 4,
        customerName: 'Buyer',
      }),
    });
    const order = await createRes.json() as any;

    await app.request(`/api/v1/${business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });

    // Delete acknowledged - SHOULD restock
    const deleteRes = await app.request(`/api/v1/${business.id}/orders/${order.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(200);

    // Verify stock restored
    const afterDelete = await app.request(`/api/v1/${business.id}/products/${productDetail.id}`, {
      headers: authHeaders(),
    });
    const productAfter = await afterDelete.json() as any;
    const finalStock = productAfter.variants.find((v: any) => v.id === variantId)?.stock;
    expect(finalStock).toBe(initialStock);
  });
});
