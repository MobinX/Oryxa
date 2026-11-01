import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 64;
const SESSION_PREFIX = 'adm_';
export const CONSOLE_SESSION_MS = 12 * 60 * 60 * 1000;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

export async function hashConsolePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyConsolePassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  const actual = await scryptAsync(password, salt);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newConsoleSessionToken(): string {
  return `${SESSION_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isConsoleSessionToken(value: string): boolean {
  return value.startsWith(SESSION_PREFIX) && value.length > SESSION_PREFIX.length + 20;
}

export function hashConsoleSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeConsoleEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function mailDomain(): string {
  return (process.env.MAIL_DOMAIN || 'onlyorders.tech').trim().toLowerCase();
}

export function isAllowedConsoleMailAddress(email: string): boolean {
  const normalized = normalizeConsoleEmail(email);
  return normalized.endsWith(`@${mailDomain()}`) && normalized.length > mailDomain().length + 1;
}

export function consolePasswordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}
