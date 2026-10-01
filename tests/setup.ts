import 'dotenv/config';

// Default test env — PGlite suites override DATABASE_URL via setTestDatabase().
// Assigned unconditionally: a developer's local .env must never change the
// secrets the suites assert against.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.INTERNAL_KEY = 'test-internal-key';
process.env.META_VERIFY_TOKEN = 'test-token';

// Mirror DATABASE_URL into NEON_DATABASE_URL for neon suites; the default
// suite excludes tests/neon via vitest.config.ts unless run explicitly.
if (!process.env.NEON_DATABASE_URL && process.env.DATABASE_URL?.includes('neon.tech')) {
  process.env.NEON_DATABASE_URL = process.env.DATABASE_URL;
}
