import { describe, it, expect } from 'vitest';
import { createOrderBodySchema, updateOrderStateInputSchema } from '@shared/schemas/order';

describe('Order Zod Schemas', () => {
  it('validates create order body', () => {
    const result = createOrderBodySchema.safeParse({
      productId: '123e4567-e89b-12d3-a456-426614174000',
      count: 2,
      customerName: 'John',
      customerPhone: '555-0100',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid order state', () => {
    const result = updateOrderStateInputSchema.safeParse({ state: 'shipped' });
    expect(result.success).toBe(false);
  });

  it('accepts valid order states', () => {
    for (const state of ['pending', 'acknowledged', 'onDelivery', 'done']) {
      expect(updateOrderStateInputSchema.safeParse({ state }).success).toBe(true);
    }
  });
});
