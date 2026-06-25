import { describe, it, expect } from 'vitest';
import { createBusinessInputSchema, updateBusinessInputSchema } from '@shared/schemas/business';

describe('Business Zod Schemas', () => {
  it('validates create business input', () => {
    const result = createBusinessInputSchema.safeParse({
      name: 'Acme',
      hasTradeLicense: true,
      hasTaxLicense: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty business name', () => {
    const result = createBusinessInputSchema.safeParse({ name: '', hasTradeLicense: false, hasTaxLicense: false });
    expect(result.success).toBe(false);
  });

  it('validates partial update', () => {
    const result = updateBusinessInputSchema.safeParse({ description: 'Updated' });
    expect(result.success).toBe(true);
  });
});
