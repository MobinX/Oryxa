import { describe, it, expect } from 'vitest';
import { createProductInputSchema } from '@repo/shared/schemas/product';

describe('Product Zod Schemas', () => {
  it('should validate a perfect product payload with variants', () => {
    const validPayload = {
      businessId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Agent Configuration Service Pack',
      price: 299.99,
      sku: 'AGENT-SRV-01',
      variants: [{ name: 'Standard Auto-Reply', stock: 100, isAvailable: true }],
    };

    const result = createProductInputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject a product with a negative price', () => {
    const invalidPayload = {
      businessId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Faulty Product',
      price: -50.0,
      sku: 'ERR-01',
    };

    const result = createProductInputSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});
