import { it, expect } from 'vitest';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import { setB2SignedUrlOverrideForTests } from '@repo/integrations/b2';
import { db } from '@db/client';
import { categories, variants } from '@db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import {
  createProduct,
  getProductById,
  getProductByVariantId,
  listProducts,
  updateProduct,
  deleteProduct,
  createCategory,
  deleteCategory,
  listCategories,
  searchProducts,
  countSearchResults,
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

  it('every variant is born with a short label, new to its own business', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Labelled',
      price: 4,
      sku: `LBL-${Date.now()}`,
      variants: [
        { name: 'One', stock: 1, isAvailable: true },
        { name: 'Two', stock: 2, isAvailable: true },
        { name: 'Three', stock: 3, isAvailable: true },
      ],
    });
    const product = await getProductById(businessId, created.id);
    const labelByName = new Map(product!.variants.map((v) => [v.name, v.variantId!]));

    for (const label of labelByName.values()) {
      expect(label).toMatch(/^[A-Z0-9]{5}$/);
    }
    expect(new Set(labelByName.values()).size).toBe(3);

    const added = await updateProduct(businessId, created.id, {
      variants: [
        ...product!.variants.map((v) => ({ id: v.id, name: v.name, stock: v.stock, isAvailable: true })),
        { name: 'Four', stock: 4, isAvailable: true },
      ],
    });
    expect(added?.updated).toBe(true);

    const after = await getProductById(businessId, created.id);
    expect(after!.variants).toHaveLength(4);
    for (const [name, label] of labelByName) {
      expect(after!.variants.find((v) => v.name === name)?.variantId).toBe(label);
    }
    expect(after!.variants.find((v) => v.name === 'Four')?.variantId).toMatch(/^[A-Z0-9]{5}$/);
    expect(new Set(after!.variants.map((v) => v.variantId)).size).toBe(4);
  });

  it('getProductByVariantId reads a variant by its label, inside its own business only', async () => {
    const businessId = await setup();
    const otherBusinessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Found By Label',
      price: 7,
      sku: `LBL-LOOKUP-${Date.now()}`,
      variants: [{ name: 'Only', stock: 3, isAvailable: true }],
    });
    const product = await getProductById(businessId, created.id);
    const label = product!.variants[0].variantId!;
    expect(label).toMatch(/^[A-Z0-9]{5}$/);

    const found = await getProductByVariantId(businessId, label);
    expect(found?.id).toBe(created.id);
    expect(found?.variants[0].variantId).toBe(label);

    expect(await getProductByVariantId(otherBusinessId, label)).toBeNull();
    expect(await getProductByVariantId(businessId, 'ZZZ99')).toBeNull();
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

  it('updateProduct changes category', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Categorized',
      price: 5,
      sku: `CAT-${Date.now()}`,
      categoryName: 'Original',
      variants: [],
    });
    const next = await createCategory(businessId, `Next-${Date.now()}`);
    await updateProduct(businessId, created.id, { categoryId: next.id });
    const after = await getProductById(businessId, created.id);
    expect(after?.category?.id).toBe(next.id);
  });

  it('updateProduct rejects unknown categoryId without changing other fields', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Keep Name',
      price: 5,
      sku: `KEEP-${Date.now()}`,
      variants: [],
    });

    await expect(
      updateProduct(businessId, created.id, {
        name: 'Renamed',
        categoryId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Category not found/);

    const after = await getProductById(businessId, created.id);
    expect(after?.name).toBe('Keep Name');
  });

  it('updateProduct syncs variants (update, add, remove)', async () => {
    const businessId = await setup();
    const created = await createProduct({
      businessId,
      name: 'Variant Product',
      price: 12,
      sku: `VAR-${Date.now()}`,
      variants: [
        { name: 'Small', stock: 3, isAvailable: true },
        { name: 'Large', stock: 7, isAvailable: true },
      ],
    });
    const before = await getProductById(businessId, created.id);
    const smallId = before!.variants.find((v) => v.name === 'Small')!.id;
    const largeId = before!.variants.find((v) => v.name === 'Large')!.id;

    await updateProduct(businessId, created.id, {
      variants: [
        { id: smallId, name: 'Small', stock: 10, isAvailable: true },
        { name: 'XL', stock: 2, isAvailable: true },
      ],
    });

    const after = await getProductById(businessId, created.id);
    expect(after?.variants).toHaveLength(2);
    expect(after?.variants.find((v) => v.id === smallId)?.stock).toBe(10);
    expect(after?.variants.some((v) => v.name === 'XL')).toBe(true);
    expect(after?.variants.some((v) => v.id === largeId)).toBe(false);

    const listed = await listProducts(businessId, { limit: 20 });
    const row = listed.products.find((p) => p.id === created.id);
    expect(row?.variantCount).toBe(2);
  });

  it('a variant keeps its whole photo set and its cover stays the first shot', async () => {
    setB2SignedUrlOverrideForTests(async (key) => `https://signed.example.com/${key}`);
    try {
      const businessId = await setup();
      const cover = `businesses/${businessId}/images/front.jpg`;
      const side = `businesses/${businessId}/images/side.jpg`;
      const created = await createProduct({
        businessId,
        name: 'Photo Album',
        price: 30,
        sku: `ALB-${Date.now()}`,
        variants: [{ name: 'Default', stock: 1, isAvailable: true, imageUrls: [cover, side] }],
      });

      const before = await getProductById(businessId, created.id);
      const variantId = before!.variants[0].id;
      expect(before!.variants[0].imageKeys).toEqual([cover, side]);
      expect(before!.variants[0].imageUrl).toBe(`https://signed.example.com/${cover}`);
      expect(before!.variants[0].imageUrls).toEqual([
        `https://signed.example.com/${cover}`,
        `https://signed.example.com/${side}`,
      ]);

      // The form submits the whole set, so dropping a shot is a save rather than a merge.
      await updateProduct(businessId, created.id, {
        variants: [
          { id: variantId, name: 'Default', stock: 1, isAvailable: true, imageUrls: [side] },
        ],
      });
      const replaced = await getProductById(businessId, created.id);
      expect(replaced!.variants[0].imageKeys).toEqual([side]);
      expect(replaced!.variants[0].imageKey).toBe(side);

      // Taking every picture away clears the set and the cover that read from it.
      await updateProduct(businessId, created.id, {
        variants: [
          {
            id: variantId,
            name: 'Default',
            stock: 1,
            isAvailable: true,
            imageUrls: [],
            clearImage: true,
          },
        ],
      });
      const cleared = await getProductById(businessId, created.id);
      expect(cleared!.variants[0].imageKeys).toEqual([]);
      expect(cleared!.variants[0].imageKey).toBeNull();
      expect(cleared!.variants[0].imageUrl).toBeUndefined();
    } finally {
      setB2SignedUrlOverrideForTests(null);
    }
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

  it('createCategory restores soft-deleted slug', async () => {
    const businessId = await setup();
    const name = `Restored-${Date.now()}`;
    const cat = await createCategory(businessId, name);
    await deleteCategory(businessId, cat.id);
    expect(await listCategories(businessId)).not.toContainEqual(expect.objectContaining({ id: cat.id }));

    const restored = await createCategory(businessId, name);
    expect(restored.id).toBe(cat.id);
    expect(restored.deletedAt).toBeNull();
    expect((await listCategories(businessId)).some((c) => c.id === cat.id)).toBe(true);
  });

  it('deleteCategory soft-deletes related products and hides category', async () => {
    const businessId = await setup();
    const catName = `Cascade-${Date.now()}`;
    const created = await createProduct({
      businessId,
      name: 'In Category',
      price: 9,
      sku: `INCAT-${Date.now()}`,
      categoryName: catName,
      variants: [{ name: 'Default', stock: 3, isAvailable: true }],
    });
    const cats = await listCategories(businessId);
    const cat = cats.find((c) => c.name === catName);
    expect(cat).toBeTruthy();
    expect(cat?.productCount).toBe(1);

    await deleteCategory(businessId, cat!.id);

    expect(await listCategories(businessId)).not.toContainEqual(expect.objectContaining({ id: cat!.id }));
    expect(await getProductById(businessId, created.id)).toBeNull();

    const leftoverVariants = await db.query.variants.findMany({
      where: and(eq(variants.productId, created.id), isNull(variants.deletedAt)),
    });
    expect(leftoverVariants).toHaveLength(0);

    const allVariants = await db.query.variants.findMany({
      where: eq(variants.productId, created.id),
    });
    expect(allVariants.length).toBeGreaterThan(0);
    expect(allVariants.every((v) => v.deletedAt !== null)).toBe(true);
  });

  it('createCategory rejects active duplicate slug', async () => {
    const businessId = await setup();
    const name = `Dup-${Date.now()}`;
    await createCategory(businessId, name);
    await expect(createCategory(businessId, name)).rejects.toThrow(/already exists/);
  });

  it('searchProducts finds by name', async () => {
    const businessId = await setup();
    const name = `Unique Gadget ${Date.now()}`;
    await createProduct({ businessId, name, price: 50, sku: `GAD-${Date.now()}`, variants: [] });
    const results = await searchProducts(businessId, 'Gadget');
    expect(results.length).toBeGreaterThan(0);
  });

  it('searchProducts excludes soft-deleted products', async () => {
    const businessId = await setup();
    const name = `Gone Widget ${Date.now()}`;
    const created = await createProduct({
      businessId,
      name,
      price: 12,
      sku: `GONE-${Date.now()}`,
      variants: [{ name: 'Default', stock: 3, isAvailable: true }],
    });
    expect((await searchProducts(businessId, 'Gone Widget')).some((p) => p.id === created.id)).toBe(true);

    await deleteProduct(businessId, created.id);

    const results = await searchProducts(businessId, 'Gone Widget');
    expect(results.some((p) => p.id === created.id)).toBe(false);
  });

  it('searchProducts excludes products in soft-deleted categories', async () => {
    const businessId = await setup();
    const catName = `HiddenCat-${Date.now()}`;
    const created = await createProduct({
      businessId,
      name: `Item In ${catName}`,
      price: 8,
      sku: `HID-${Date.now()}`,
      categoryName: catName,
      variants: [],
    });
    const cats = await listCategories(businessId);
    const cat = cats.find((c) => c.name === catName)!;
    await deleteCategory(businessId, cat.id);

    const results = await searchProducts(businessId, catName);
    expect(results.some((p) => p.id === created.id)).toBe(false);
  });

  it('the page and the total count the same products when a shelf went away under one of them', async () => {
    const businessId = await setup();
    const catName = `DriftCat-${Date.now()}`;
    // Named so the doomed row sorts FIRST: a window that filters after LIMIT/OFFSET then hands back an
    // empty page while the total, filtered in SQL, still says one product exists.
    await createProduct({
      businessId,
      name: `Aaa ${catName}`,
      price: 9,
      sku: `DRIFT-A-${Date.now()}`,
      categoryName: catName,
      variants: [],
    });
    const kept = await createProduct({
      businessId,
      name: `Zzz ${catName}`,
      price: 9,
      sku: `DRIFT-Z-${Date.now()}`,
      variants: [],
    });

    const cat = (await listCategories(businessId)).find((c) => c.name === catName)!;
    // The state deleteCategory no longer produces — shelf deleted, the product on it left live. Legacy
    // rows are in it, and it is the only way to prove the two reads share one filter.
    await db.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, cat.id));

    const page = await searchProducts(businessId, catName, 1, { offset: 0 });
    const total = await countSearchResults(businessId, catName);

    expect(page.map((p) => p.id)).toEqual([kept.id]);
    expect(total).toBe(1);
    expect(page.length).toBe(total);
  });
}
