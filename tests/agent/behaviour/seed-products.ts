import { createProduct, getProductById } from '@repo/db/crud/product';

/** Variant shape returned by the seeder. */
export type SeededVariant = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

/** Full product shape returned by the seeder. */
export type SeededProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  description: string;
  variants: SeededVariant[];
};

/** The full catalogue of known products created for behaviour tests. */
export type BehaviourCatalog = {
  tshirt: SeededProduct;
  laptop: SeededProduct;
  headphones: SeededProduct;
};

/**
 * Creates a fixed, known product catalogue for agent behaviour tests.
 *
 * All names, SKUs, prices, and variant names are deterministic so test
 * assertions can use exact string/regex matching without brittle
 * auto-generated values.
 *
 * Call this in `beforeAll` and capture the returned catalog.
 * Delete via `deleteProduct(businessId, id)` in `afterAll` — or rely on the
 * business cascade delete if you are tearing down the full world.
 */
export async function seedBehaviourProducts(businessId: string): Promise<BehaviourCatalog> {
  // ── T-Shirt ────────────────────────────────────────────────────────────────
  const tshirtRef = await createProduct({
    businessId,
    name: 'Arctic Breeze T-Shirt',
    price: 29.99,
    sku: 'ABT-001',
    description: 'A lightweight cotton t-shirt perfect for warm days.',
    categoryName: 'Apparel',
    variants: [
      { name: 'Blue M', stock: 5, isAvailable: true, price: 29.99 },
      { name: 'Red L', stock: 3, isAvailable: true, price: 29.99 },
      { name: 'Black XL', stock: 0, isAvailable: false, price: 29.99 },
    ],
  });

  // ── Laptop ─────────────────────────────────────────────────────────────────
  // Use 'Computers' (not 'Electronics') so it gets its own unique category slug
  // and doesn't conflict with Headphones inserted next.
  const laptopRef = await createProduct({
    businessId,
    name: 'ProBook Laptop 15',
    price: 999.0,
    sku: 'PBL-015',
    description: 'A powerful 15-inch laptop for professionals and students.',
    categoryName: 'Computers',
    variants: [
      { name: '8GB RAM', stock: 2, isAvailable: true, price: 999.0 },
      { name: '16GB RAM', stock: 1, isAvailable: true, price: 1199.0 },
    ],
  });

  // ── Headphones ─────────────────────────────────────────────────────────────
  const headphonesRef = await createProduct({
    businessId,
    name: 'SoundWave Headphones',
    price: 79.99,
    sku: 'SWH-X1',
    description: 'Premium over-ear headphones with active noise cancellation.',
    categoryName: 'Audio',
    variants: [
      { name: 'Black', stock: 10, isAvailable: true, price: 79.99 },
      { name: 'White', stock: 4, isAvailable: true, price: 79.99 },
    ],
  });

  // Fetch full detail (with variant IDs) for all three products
  const [tshirtDetail, laptopDetail, headphonesDetail] = await Promise.all([
    getProductById(businessId, tshirtRef.id),
    getProductById(businessId, laptopRef.id),
    getProductById(businessId, headphonesRef.id),
  ]);

  if (!tshirtDetail || !laptopDetail || !headphonesDetail) {
    throw new Error('Failed to seed behaviour products — getProductById returned null');
  }

  const mapProduct = (p: NonNullable<typeof tshirtDetail>): SeededProduct => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    description: p.description ?? '',
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price ?? p.price,
      stock: v.stock,
    })),
  });

  return {
    tshirt: mapProduct(tshirtDetail),
    laptop: mapProduct(laptopDetail),
    headphones: mapProduct(headphonesDetail),
  };
}
