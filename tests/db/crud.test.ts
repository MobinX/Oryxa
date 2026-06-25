import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@repo/db/client';
import { users, businesses } from '@repo/db/schema';
import { createProduct } from '@repo/db/crud/product';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Database CRUD Operations', () => {
  let testUserId: string;
  let testBusinessId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Test Admin',
        firebaseUid: `test-uid-${Date.now()}`,
        signInMethod: 'email',
      })
      .returning();
    testUserId = user.id;

    const [business] = await db
      .insert(businesses)
      .values({
        userId: testUserId,
        name: 'Test Agents as a Service Co.',
      })
      .returning();
    testBusinessId = business.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should create a product with inline category and variants atomically', async () => {
    const productData = {
      businessId: testBusinessId,
      name: 'Automated Messenger Agent AI',
      price: 150.0,
      sku: 'AI-MSG-001',
      categoryName: 'AI Services',
      description: 'Provides automated messenger agents and AI post creation.',
      variants: [{ name: 'Basic Tier', stock: 999, isAvailable: true }],
    };

    const newProduct = await createProduct(productData);

    expect(newProduct).toBeDefined();
    expect(newProduct.slug).toBe('automated-messenger-agent-ai');
    expect(newProduct.variantCount).toBe(1);
  });

  it('should enforce composite unique constraint on businessId + slug', async () => {
    const duplicateData = {
      businessId: testBusinessId,
      name: 'Automated Messenger Agent AI',
      price: 200.0,
      sku: 'AI-MSG-002',
      variants: [],
    };

    await expect(createProduct(duplicateData)).rejects.toThrow();
  });
});
