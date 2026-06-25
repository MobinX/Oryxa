import { describe, it, expect } from 'vitest';
import { syncUserInputSchema } from '@shared/schemas/user';

describe('User Zod Schemas', () => {
  it('validates sync user input', () => {
    const result = syncUserInputSchema.safeParse({
      firebaseUid: 'uid-123',
      name: 'Jane',
      email: 'jane@test.com',
      signInMethod: 'google',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing firebaseUid', () => {
    const result = syncUserInputSchema.safeParse({ name: 'Jane', signInMethod: 'google' });
    expect(result.success).toBe(false);
  });
});
