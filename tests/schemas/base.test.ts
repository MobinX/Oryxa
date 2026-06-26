import { describe, it, expect } from 'vitest';
import { uuidSchema, platformSchema, orderStateSchema } from '@shared/schemas/base';

describe('Base Zod Schemas', () => {
  it('validates uuid', () => {
    expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('validates platform enum', () => {
    expect(platformSchema.safeParse('facebook').success).toBe(true);
    expect(platformSchema.safeParse('snapchat').success).toBe(false);
  });

  it('validates order state enum', () => {
    expect(orderStateSchema.safeParse('pending').success).toBe(true);
    expect(orderStateSchema.safeParse('cancelled').success).toBe(false);
  });
});
