import { describe, it, expect } from 'vitest';
import { withNeon, getNeonDatabaseUrl } from '../helpers/with-neon';

const neonUrl = getNeonDatabaseUrl();

describe.skipIf(!neonUrl)('Neon DB connection', () => {
  withNeon();

  it('connects to Neon', async () => {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(neonUrl!);
    const rows = await sql`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
  });
});
