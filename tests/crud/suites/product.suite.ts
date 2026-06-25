import { it, expect } from 'vitest';
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

export function registerProductCrudTests() {
  async function setup() {
    const user = await syncUser({
      firebaseUid: `prod-${Date.now()}-${Math.random()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const business = await createBusiness(user.id, {
      name: 'Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    return business.id;
  }

  it('createProduct with category and variants', async () => {
    const businessId = await setup();
    const product = await createProduct({
      businessId,
      name: 'Automated Messenger Agent AI',
      price: 150,
      sku: `AI-MSG-${Date.now()}`,
      categoryName: 'AI Services',
      variants: [{ name: 'Basic Tier', stock: 999, isAvailable: true }],
    });
    expect(product.slug).toBe('automated-messenger-agent-ai');
    expect(product.variantCount).toBe(1);
  });

  it('enforces unique slug per business', async () => {
    const businessId = await setup();
    const sku1 = `SKU-1-${Date.now()}`;
    const sku2 = `SKU-2-${Date.now()}`;
    await createProduct({ businessId, name: 'Duplicate Name', price: 10, sku: sku1, variants: [] });
    await expect(
      createProduct({ businessId, name: 'Duplicate Name', price: 20, sku: sku2, variants: [] }),
    ).rejects.toThrow();
  });

  it('getProductById returns nested variants', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Widget',
      price: 9.99,
      sku: `W-${Date.now()}`,
      variants: [{ name: 'Blue', stock: 5, isAvailable: true }],
    });
    const product = await getProductById(businessId, created.id);
    expect(product?.variants).toHaveLength(1);
  });

  it('listProducts paginates', async () => {
    const businessId = await setup();
    const ts = Date.now();
    await createProduct({ businessId, name: 'A', price: 1, sku: `A-${ts}`, variants: [] });
    await createProduct({ businessId, name: 'B', price: 2, sku: `B-${ts}`, variants: [] });
    const result = await listProducts(businessId, { limit: 1, offset: 0 });
    expect(result.products).toHaveLength(1);
    expect(result.totalCount).toBe(2);
  });

  it('updateProduct changes fields', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Old',
      price: 5,
      sku: `OLD-${Date.now()}`,
      variants: [],
    });
    const result = await updateProduct(businessId, created.id, { name: 'New', price: 10 });
    expect(result?.updated).toBe(true);
  });

  it('deleteProduct removes product', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Del',
      price: 1,
      sku: `DEL-${Date.now()}`,
      variants: [],
    });
    const result = await deleteProduct(businessId, created.id);
    expect(result?.deleted).toBe(true);
    expect(await getProductById(businessId, created.id)).toBeNull();
  });

  it('createCategory and listCategories', async () => {
    const businessId = await setup();
    const cat = await createCategory(businessId, `Electronics-${Date.now()}`);
    expect(cat.slug).toMatch(/^electronics/);
    const cats = await listCategories(businessId);
    expect(cats.some((c) => c.id === cat.id)).toBe(true);
  });

  it('searchProducts finds by name', async () => {
    const businessId = await setup();
    const name = `Unique Gadget ${Date.now()}`;
    await createProduct({ businessId, name, price: 50, sku: `GAD-${Date.now()}`, variants: [] });
    const results = await searchProducts(businessId, 'Gadget');
    expect(results.length).toBeGreaterThan(0);
  });
}
