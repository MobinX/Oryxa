import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
  createCategory,
  listCategories,
  searchProducts,
} from '@repo/db/crud/product';

describe('Product CRUD', () => {
  withPglite();
  let businessId: string;

  async function setup() {
    const user = await syncUser({ firebaseUid: `prod-${Date.now()}`, name: 'Owner', signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: 'Shop', hasTradeLicense: false, hasTaxLicense: false });
    businessId = business.id;
  }

  it('createProduct with category and variants', async () => {
    await setup();
    const product = await createProduct({
      businessId,
      name: 'Automated Messenger Agent AI',
      price: 150,
      sku: 'AI-MSG-001',
      categoryName: 'AI Services',
      variants: [{ name: 'Basic Tier', stock: 999, isAvailable: true }],
    });
    expect(product.slug).toBe('automated-messenger-agent-ai');
    expect(product.variantCount).toBe(1);
  });

  it('enforces unique slug per business', async () => {
    await setup();
    await createProduct({ businessId, name: 'Duplicate Name', price: 10, sku: 'SKU-1', variants: [] });
    await expect(
      createProduct({ businessId, name: 'Duplicate Name', price: 20, sku: 'SKU-2', variants: [] }),
    ).rejects.toThrow();
  });

  it('getProductById returns nested variants', async () => {
    await setup();
    const created = await createProduct({
      businessId,
      name: 'Widget',
      price: 9.99,
      sku: 'W-1',
      variants: [{ name: 'Blue', stock: 5, isAvailable: true }],
    });
    const product = await getProductById(businessId, created.id);
    expect(product?.variants).toHaveLength(1);
    expect(product?.category?.name).toBeUndefined();
  });

  it('listProducts paginates', async () => {
    await setup();
    await createProduct({ businessId, name: 'A', price: 1, sku: 'A', variants: [] });
    await createProduct({ businessId, name: 'B', price: 2, sku: 'B', variants: [] });
    const result = await listProducts(businessId, { limit: 1, offset: 0 });
    expect(result.products).toHaveLength(1);
    expect(result.totalCount).toBe(2);
  });

  it('updateProduct changes fields', async () => {
    await setup();
    const created = await createProduct({ businessId, name: 'Old', price: 5, sku: 'OLD', variants: [] });
    const result = await updateProduct(businessId, created.id, { name: 'New', price: 10 });
    expect(result?.updated).toBe(true);
  });

  it('deleteProduct removes product', async () => {
    await setup();
    const created = await createProduct({ businessId, name: 'Del', price: 1, sku: 'DEL', variants: [] });
    const result = await deleteProduct(businessId, created.id);
    expect(result?.deleted).toBe(true);
    expect(await getProductById(businessId, created.id)).toBeNull();
  });

  it('createCategory and listCategories', async () => {
    await setup();
    const cat = await createCategory(businessId, 'Electronics');
    expect(cat.slug).toBe('electronics');
    const cats = await listCategories(businessId);
    expect(cats.some((c) => c.id === cat.id)).toBe(true);
  });

  it('searchProducts finds by name', async () => {
    await setup();
    await createProduct({ businessId, name: 'Unique Gadget', price: 50, sku: 'GAD-1', variants: [] });
    const results = await searchProducts(businessId, 'Gadget');
    expect(results.length).toBeGreaterThan(0);
  });
});
