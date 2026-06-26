import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

describe('Orders API', () => {
  withPglite();

  it('POST /:businessId/orders creates order', async () => {
    const { business, productDetail } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        productId: productDetail.id,
        variantId: productDetail.variants[0]?.id,
        count: 1,
        customerName: 'API Buyer',
        customerPhone: '555-9999',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.state).toBe('pending');
    expect(body.totalPrice).toBeGreaterThan(0);
  });

  it('GET /:businessId/orders lists orders', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/orders`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('PATCH /:businessId/orders/:orderId/state updates state', async () => {
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
    const order = await createRes.json();
    const res = await app.request(`/api/v1/${seed.business.id}/orders/${order.id}/state`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ state: 'acknowledged' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).newState).toBe('acknowledged');
  });
});
