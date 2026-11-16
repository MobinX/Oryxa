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

  it('validates storeTheme as both string and object in business updates', () => {
    const stringTheme = updateBusinessInputSchema.safeParse({ storeTheme: 'classic' });
    expect(stringTheme.success).toBe(true);
    if (stringTheme.success) {
      expect(stringTheme.data.storeTheme).toEqual({ structure: 'classic' });
    }

    const objectTheme = updateBusinessInputSchema.safeParse({ storeTheme: { structure: 'editorial' } });
    expect(objectTheme.success).toBe(true);
    if (objectTheme.success) {
      expect(objectTheme.data.storeTheme).toEqual({ structure: 'editorial' });
    }

    const presetTheme = updateBusinessInputSchema.safeParse({ storeTheme: 'gallery' });
    expect(presetTheme.success).toBe(true);
    if (presetTheme.success) {
      expect(presetTheme.data.storeTheme).toEqual({ preset: 'gallery' });
    }
  });
});
