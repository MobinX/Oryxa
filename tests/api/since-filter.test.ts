import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { getPgliteDb } from '../helpers/pglite-db';
import { products } from '@repo/db/schema';
import { eq } from 'drizzle-orm';

const PAST = '2000-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

/**
 * Every read endpoint takes the same `since` filter. A row is returned when its
 * last-change timestamp is at or after the instant. These tests exercise both
 * kinds of backing column: tables with a real `updatedAt` (plans) and tables that
 * fall back to `createdAt` / `lastStateAt` (products, categories, conversations,
 * channels).
 */
describe('since filter on read endpoints', () => {
  withPglite();

  it('GET products: future since returns none, past since returns the seeded product', async () => {
    const { business, product } = await seedTestWorld();
    const base = `/api/v1/${business.id}/products`;

    const all = await app.request(base, { headers: authHeaders() });
    expect(all.status).toBe(200);
    expect(((await all.json()) as any).products.length).toBeGreaterThan(0);

    const none = await app.request(`${base}?since=${FUTURE}`, { headers: authHeaders() });
    expect(none.status).toBe(200);
    expect(((await none.json()) as any).products).toHaveLength(0);

    const some = await app.request(`${base}?since=${PAST}`, { headers: authHeaders() });
    expect(some.status).toBe(200);
    expect(((await some.json()) as any).products.some((p: any) => p.id === product.id)).toBe(true);
  });

  it('GET products: since is inclusive on the row timestamp', async () => {
    const { business } = await seedTestWorld();
    const base = `/api/v1/${business.id}/products`;
    const all = (await (await app.request(base, { headers: authHeaders() })).json()) as any;
    const exact = all.products[0].createdAt as string;

    const res = await app.request(`${base}?since=${encodeURIComponent(exact)}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).products.some((p: any) => p.createdAt === exact)).toBe(true);
  });

  it('GET categories supports since', async () => {
    const { business } = await seedTestWorld();
    const base = `/api/v1/${business.id}/categories`;

    const none = await app.request(`${base}?since=${FUTURE}`, { headers: authHeaders() });
    expect(none.status).toBe(200);
    expect((await none.json()) as any).toHaveLength(0);

    const some = await app.request(`${base}?since=${PAST}`, { headers: authHeaders() });
    expect(((await some.json()) as any).length).toBeGreaterThan(0);
  });

  it('GET conversations supports since (lastStateAt fallback)', async () => {
    const { business } = await seedTestWorld();
    const base = `/api/v1/${business.id}/conversations`;

    const none = await app.request(`${base}?since=${FUTURE}`, { headers: authHeaders() });
    expect(none.status).toBe(200);
    expect((await none.json()) as any).toHaveLength(0);

    const some = await app.request(`${base}?since=${PAST}`, { headers: authHeaders() });
    expect(((await some.json()) as any).length).toBeGreaterThan(0);
  });

  it('GET channels supports since (createdAt fallback)', async () => {
    const { business } = await seedTestWorld();
    const base = `/api/v1/${business.id}/channels`;

    const none = await app.request(`${base}?since=${FUTURE}`, { headers: authHeaders() });
    expect(none.status).toBe(200);
    expect((await none.json()) as any).toHaveLength(0);

    const some = await app.request(`${base}?since=${PAST}`, { headers: authHeaders() });
    expect(((await some.json()) as any).length).toBeGreaterThan(0);
  });

  it('GET public plans supports since on updatedAt', async () => {
    const all = await app.request('/api/v1/plans');
    expect(all.status).toBe(200);
    expect(((await all.json()) as any).length).toBeGreaterThan(0);

    const none = await app.request(`/api/v1/plans?since=${FUTURE}`);
    expect(none.status).toBe(200);
    expect((await none.json()) as any).toHaveLength(0);

    const some = await app.request(`/api/v1/plans?since=${PAST}`);
    expect(((await some.json()) as any).length).toBeGreaterThan(0);
  });

  it('updatedAt is set on insert and bumped by a PUT', async () => {
    const { business, product } = await seedTestWorld();
    const db = getPgliteDb();
    const [before] = await db
      .select({ updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, product.id));
    expect(before.updatedAt).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 25));
    const res = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Renamed since test' }),
    });
    expect(res.status).toBe(200);

    const [after] = await db
      .select({ updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, product.id));
    expect(after.updatedAt!.getTime()).toBeGreaterThan(before.updatedAt!.getTime());
  });

  it('an empty since means no filter, so existing clients are unaffected', async () => {
    const { business } = await seedTestWorld();
    const base = `/api/v1/${business.id}/products`;
    const plain = (await (await app.request(base, { headers: authHeaders() })).json()) as any;
    const empty = (await (await app.request(`${base}?since=`, { headers: authHeaders() })).json()) as any;
    expect(empty.products.length).toBe(plain.products.length);
  });

  it('a malformed since never turns a read into a server error', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products?since=not-a-date`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status);
  });
});
