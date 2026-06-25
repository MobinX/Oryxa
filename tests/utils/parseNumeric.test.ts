import { describe, it, expect } from 'vitest';
import { parseNumeric } from '@repo/utils';

describe('parseNumeric', () => {
  it('parses numeric strings', () => {
    expect(parseNumeric('12.5')).toBe(12.5);
  });

  it('returns 0 for nullish values', () => {
    expect(parseNumeric(null)).toBe(0);
    expect(parseNumeric(undefined)).toBe(0);
  });
});
