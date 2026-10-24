import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

describe('Products API', () => {
  withPglite();

  it('POST /:businessId/products returns 201', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'API Product',
        price: 19.99,
        sku: 'API-01',
        variants: [{ name: 'Default', stock: 5, isAvailable: true }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.slug).toBe('api-product');
  });

  it('GET /:businessId/products lists products', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.totalCount).toBeGreaterThan(0);
  });

  it('GET /:businessId/products/:productId returns product', async () => {
    const { business, product } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.name).toBe('Test T-Shirt');
  });

  it('GET /:businessId/products/:productId returns 404 if missing', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${business.id}/products/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Product entity missing');
  });

  it('GET /:businessId/variants/:variantId returns the product wearing that label', async () => {
    const { business, product, productDetail } = await seedTestWorld();
    const label = productDetail.variants[0].variantId;
    expect(label).toMatch(/^[A-Z0-9]{5}$/);

    const res = await app.request(`/api/v1/${business.id}/variants/${label}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      variants: Array<{ id: string; variantId: string | null }>;
    };
    expect(body.id).toBe(product.id);
    expect(body.variants.find((v) => v.id === productDetail.variants[0].id)?.variantId).toBe(label);
  });

  it('GET /:businessId/variants/:variantId returns 404 for a label from another business', async () => {
    const { business, productDetail } = await seedTestWorld();
    const other = await seedTestWorld();
    const label = productDetail.variants[0].variantId;

    const res = await app.request(`/api/v1/${other.business.id}/variants/${label}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('Variant not found for this business');
  });

  it('GET /:businessId/variants/:variantId returns 400 for something that is not a label', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/variants/blue-xl`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /:businessId/products/:productId returns 400 for unknown category', async () => {
    const { business, product } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ categoryId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('Category not found');
  });

  it('PUT /:businessId/products/:productId updates product', async () => {
    const { business, product } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ price: 39.99 }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).updated).toBe(true);
  });

  it('PUT /:businessId/products/:productId updates variants', async () => {
    const { business, product, productDetail } = await seedTestWorld();
    const variantId = productDetail.variants[0]?.id;
    expect(variantId).toBeTruthy();

    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        variants: [
          { id: variantId, name: 'Red M', stock: 25, isAvailable: true },
          { name: 'Green L', stock: 4, isAvailable: true },
        ],
      }),
    });
    expect(res.status).toBe(200);

    const getRes = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      headers: authHeaders(),
    });
    const body = await getRes.json() as any;
    expect(body.variants).toHaveLength(2);
    expect(body.variants.find((v: { id: string }) => v.id === variantId)?.stock).toBe(25);
    expect(body.variants.some((v: { name: string }) => v.name === 'Green L')).toBe(true);
  });

  it('DELETE /:businessId/products/:productId deletes product', async () => {
    const { business, product } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).deleted).toBe(true);
  });

  it('POST /:businessId/categories creates category', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/categories`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Books' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json() as any).slug).toBe('books');
  });

  it('GET /:businessId/categories lists categories', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/categories`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body)).toBe(true);
  });
});
