import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { createProduct } from '@repo/db/crud/product';
import { createBusiness } from '@repo/db/crud/business';
import { syncUser } from '@repo/db/crud/user';
import { buildCatalogSummary } from '@api/lib/catalog-summary';

/**
 * The block in front of the agent every turn is the only place a shop's shelves are ever said out loud.
 *
 * It used to reach the category read only past ten products, while every live store sits under that
 * number — so no agent had ever been told what its store groups by, and a customer asking "which
 * categories do you have" got the same product cards back with the product count dressed up as a
 * category count. These tests fail on that version.
 */
describe('the catalog block names the shelves', () => {
  withPglite();

  async function seededStore() {
    const seed = await seedTestWorld();
    for (const name of ['Encilor', 'Monas']) {
      await createProduct({
        businessId: seed.business.id,
        name,
        price: 15,
        sku: `SHELF-${name}-${Date.now()}`,
        description: 'Allergic relief',
        categoryName: 'Sleeping Med',
        variants: [{ name: 'Fg', stock: 5, isAvailable: true, price: 15 }],
      });
    }
    return seed;
  }

  it('under the naming limit, where the whole catalog fits on one page', async () => {
    const seed = await seededStore();
    const { summary, total } = await buildCatalogSummary(seed.business.id);

    expect(total).toBeLessThanOrEqual(10);
    expect(summary).toContain('Categories:');
    expect(summary).toContain('Sleeping Med (2)');
    expect(summary).toContain('Apparel (1)');
    expect(summary).toMatch(/whole catalog/);
    // A question about kinds is answered in words, not by re-sending the products.
    expect(summary).toMatch(/answer from the Categories/i);
    expect(summary).toMatch(/the product count is not\s+the answer/i);
  });

  it('still says the shelves to a thread that cannot send cards, and sends it to no tool it lacks', async () => {
    const seed = await seededStore();
    const { summary } = await buildCatalogSummary(seed.business.id, { canShowCards: false });

    expect(summary).toContain('Sleeping Med (2)');
    expect(summary).not.toContain('show_products');
  });

  it('says plainly that a shop which groups nothing has no category to offer', async () => {
    const user = await syncUser({
      firebaseUid: `flat-${Date.now()}-${Math.random()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const business = await createBusiness(user.id, {
      name: 'Uncategorised Store',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    await createProduct({
      businessId: business.id,
      name: 'Loose Item',
      price: 5,
      sku: `FLAT-${Date.now()}`,
      variants: [{ name: 'One', stock: 2, isAvailable: true, price: 5 }],
    });

    const { summary } = await buildCatalogSummary(business.id);

    expect(summary).toContain('does not group its products into categories');
    expect(summary).not.toContain('Categories:');
  });
});
