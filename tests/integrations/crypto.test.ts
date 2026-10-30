import { beforeAll, describe, expect, it } from 'vitest';
import {
  encryptMessageSecret,
  decryptMessageSecret,
  isEncryptedEnvelope,
  hmacSha256Hex,
  timingSafeEquals,
} from '@repo/integrations/crypto';

describe('channel secret encryption (spec E)', () => {
  beforeAll(() => {
    process.env.MESSAGES_ENCRYPTION_KEY = 'test-key-for-crypto-suite-0123456789';
  });

  it('round-trips a token through the v1 envelope', () => {
    const stored = encryptMessageSecret('EAAG-secret-token');
    expect(isEncryptedEnvelope(stored)).toBe(true);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('EAAG-secret-token');
    expect(decryptMessageSecret(stored)).toBe('EAAG-secret-token');
  });

  it('produces a different envelope every write (random iv)', () => {
    const a = encryptMessageSecret('same-token');
    const b = encryptMessageSecret('same-token');
    expect(a).not.toBe(b);
    expect(decryptMessageSecret(a)).toBe('same-token');
    expect(decryptMessageSecret(b)).toBe('same-token');
  });

  it('passes legacy plaintext through untouched', () => {
    const legacy = 'legacy-page-access-token';
    expect(isEncryptedEnvelope(legacy)).toBe(false);
    expect(decryptMessageSecret(legacy)).toBe(legacy);
  });

  it('refuses to decrypt with a different key', () => {
    process.env.MESSAGES_ENCRYPTION_KEY = 'correct-key-must-be-long-enough';
    const stored = encryptMessageSecret('secret');
    try {
      process.env.MESSAGES_ENCRYPTION_KEY = 'another-key-also-must-be-long';
      expect(() => decryptMessageSecret(stored)).toThrow(/failed to decrypt/);
    } finally {
      process.env.MESSAGES_ENCRYPTION_KEY = 'correct-key-must-be-long-enough';
    }
  });

  it('rejects an envelope whose auth tag was tampered with', () => {
    const stored = encryptMessageSecret('secret');
    const [v1, iv, tag, ] = stored.split(':');
    const flipped = Buffer.from(tag, 'base64');
    flipped[0] = flipped[0] ^ 0x01;
    expect(() => decryptMessageSecret([v1, iv, Buffer.from(flipped).toString('base64'), ''].join(':'))).toThrow();
  });

  it('treats a "v1:"-prefixed plaintext that is not an envelope as legacy', () => {
    expect(isEncryptedEnvelope('v1:not-an-envelope')).toBe(false);
    expect(decryptMessageSecret('v1:not-an-envelope')).toBe('v1:not-an-envelope');
  });

  it('signs webhooks (hmac hex) and compares timing-safely', () => {
    expect(hmacSha256Hex('secret', 'body')).toBe(hmacSha256Hex('secret', 'body'));
    expect(hmacSha256Hex('secret', 'body')).not.toBe(hmacSha256Hex('other', 'body'));
    expect(timingSafeEquals(hmacSha256Hex('secret', 'body'), hmacSha256Hex('secret', 'body'))).toBe(true);
    expect(timingSafeEquals('a', 'ab')).toBe(false);
  });
});
