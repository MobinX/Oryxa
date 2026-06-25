import { describe, it, expect, afterEach } from 'vitest';
import { setTestDatabase } from '@db/client';

describe('db client', () => {
  afterEach(() => {
    setTestDatabase(null);
    delete process.env.DATABASE_URL;
  });

  it('throws when DATABASE_URL is missing and no test override', async () => {
    setTestDatabase(null);
    delete process.env.DATABASE_URL;
    const { db } = await import('@db/client');
    expect(() => db.select).toThrow('DATABASE_URL is not set');
  });
});
