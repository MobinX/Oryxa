import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * At-rest encryption for channel bearer tokens and API secrets (spec E). The value
 * stored in `channels.api_token` is a versioned envelope "v1:<iv>:<tag>:<ciphertext>",
 * so a future cipher can migrate envelope by envelope. Keys come from
 * `MESSAGES_ENCRYPTION_KEY` (names only, never logged); a key set via an env var is
 * used in raw 32-byte form when it already is 32 bytes, otherwise the env var is a
 * passphrase hashed to 32 bytes.
 */

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super('MESSAGES_ENCRYPTION_KEY is not configured');
    this.name = 'EncryptionKeyMissingError';
  }
}

/** Envelope prefix for values this module produced. Anything else is legacy plaintext. */
export const ENVELOPE_V1 = 'v1';

function resolveKey(): Buffer {
  const pass = process.env.MESSAGES_ENCRYPTION_KEY;
  if (!pass) throw new EncryptionKeyMissingError();
  const trimmed = pass.trim();
  if (trimmed.match(/^[0-9a-fA-F]{64}$/)) return Buffer.from(trimmed, 'hex');
  return createHash('sha256').update(trimmed, 'utf8').digest();
}

export function encryptMessageSecret(plain: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_V1, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypts an envelope, or passes a legacy plaintext through untouched — old rows were
 * written before the envelope existed and must keep working until re-encrypted.
 */
export function decryptMessageSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== ENVELOPE_V1) return stored;
  const key = resolveKey();
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('stored channel secret failed to decrypt — wrong MESSAGES_ENCRYPTION_KEY?');
  }
}

/** True if the stored value is one of our envelopes (not a legacy plaintext). */
export function isEncryptedEnvelope(stored: string): boolean {
  const parts = stored.split(':');
  return parts.length === 4 && parts[0] === ENVELOPE_V1;
}

/** HMAC-SHA256 hex digest for webhook signatures (whatsapp, meta). */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/** Compare two strings in a way that does not leak where they first differ. */
export function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
