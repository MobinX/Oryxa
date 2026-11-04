import { describe, expect, it } from 'vitest';
import {
  createConsoleSession,
  createConsoleUser,
  deleteConsoleSession,
  deleteConsoleUser,
  getConsoleUserByEmail,
  getConsoleUserBySessionHash,
  updateConsoleUser,
} from '@repo/db/crud/console-users';
import {
  hashConsolePassword,
  hashConsoleSessionToken,
  isAllowedConsoleMailAddress,
  newConsoleSessionToken,
  verifyConsolePassword,
} from '@api/lib/console-auth';
import { consoleCan } from '@api/lib/console-capabilities';
import { withPglite } from '../helpers/with-pglite';

describe('console admin database', () => {
  withPglite({ timeoutMs: 300_000 });

  it('seeds the superuser with a scrypt hash and the superuser role', async () => {
    const superuser = await getConsoleUserByEmail('ceo@onlyorders.tech');
    expect(superuser).not.toBeNull();
    expect(superuser?.role).toBe('superuser');
    expect(superuser?.isActive).toBe(true);
    expect(superuser?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(superuser?.capabilities).toEqual([]);
  });

  it('hashes and verifies admin passwords', async () => {
    const hash = await hashConsolePassword('test-password-123');
    expect(await verifyConsolePassword('test-password-123', hash)).toBe(true);
    expect(await verifyConsolePassword('wrong-password', hash)).toBe(false);
  });

  it('creates, authenticates, updates and deletes an admin session', async () => {
    const email = 'console-test@onlyorders.tech';
    const hash = await hashConsolePassword('test-password-123');
    const admin = await createConsoleUser({
      email,
      passwordHash: hash,
      name: 'Console Test',
      capabilities: ['dashboard', 'inbox'],
    });
    expect(admin.email).toBe(email);
    expect(admin.capabilities).toEqual(['dashboard', 'inbox']);

    const token = newConsoleSessionToken();
    const tokenHash = hashConsoleSessionToken(token);
    await createConsoleSession({
      tokenHash,
      userId: admin.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const sessionUser = await getConsoleUserBySessionHash(tokenHash);
    expect(sessionUser?.id).toBe(admin.id);
    expect(sessionUser?.capabilities).toEqual(['dashboard', 'inbox']);

    const updated = await updateConsoleUser(admin.id, { capabilities: ['inbox'] });
    expect(updated?.capabilities).toEqual(['inbox']);
    expect(consoleCan(updated, 'inbox')).toBe(true);
    expect(consoleCan(updated, 'dashboard')).toBe(false);

    await deleteConsoleSession(tokenHash);
    expect(await getConsoleUserBySessionHash(tokenHash)).toBeNull();

    expect(await deleteConsoleUser(admin.id)).toBe(true);
    expect(await getConsoleUserByEmail(email)).toBeNull();
  });

  it('accepts only mail addresses on the configured domain', () => {
    expect(isAllowedConsoleMailAddress('someone@onlyorders.tech')).toBe(true);
    expect(isAllowedConsoleMailAddress('someone@example.com')).toBe(false);
  });

  it('grants every capability to a superuser regardless of stored list', () => {
    expect(consoleCan({ role: 'superuser', capabilities: [] }, 'logs')).toBe(true);
    expect(consoleCan({ role: 'admin', capabilities: [] }, 'logs')).toBe(false);
  });
});
