import { describe, it, expect } from 'vitest';
import { slugify, parseNumeric } from '@repo/utils';

describe('Utils', () => {
  it('slugify converts text to slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
  });

  it('parseNumeric parses string numbers', () => {
    expect(parseNumeric('29.99')).toBe(29.99);
    expect(parseNumeric(null)).toBe(0);
    expect(parseNumeric(undefined)).toBe(0);
  });
});
