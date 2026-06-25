import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const neonUrl = process.env.NEON_DATABASE_URL;

describe.skipIf(!neonUrl)('Neon DB integration (optional)', () => {
  let client: { end: () => Promise<void> } | undefined;

  beforeAll(async () => {
    const postgres = (await import('postgres')).default;
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const schema = await import('@db/schema');
    const { setTestDatabase } = await import('@db/client');

    const sql = postgres(neonUrl!, { prepare: false, max: 1 });
    client = sql;
    const db = drizzle(sql, { schema });
    setTestDatabase(db);
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    const { setTestDatabase } = await import('@db/client');
    setTestDatabase(null);
    await client?.end();
  });

  it('creates product against real Neon Postgres', async () => {
    const { syncUser } = await import('@repo/db/crud/user');
    const { createBusiness } = await import('@repo/db/crud/business');
    const { createProduct } = await import('@repo/db/crud/product');

    const uid = `neon-test-${Date.now()}`;
    const user = await syncUser({ firebaseUid: uid, name: 'Neon Tester', signInMethod: 'google' });
    const business = await createBusiness(user.id, {
      name: `Neon Shop ${Date.now()}`,
      hasTradeLicense: false,
      hasTaxLicense: false,
    });

    const product = await createProduct({
      businessId: business.id,
      name: 'Neon Product',
      price: 99.99,
      sku: `NEON-${Date.now()}`,
      variants: [],
    });

    expect(product.slug).toBe('neon-product');
  });
});
