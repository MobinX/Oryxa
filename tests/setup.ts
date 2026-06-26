import 'dotenv/config';

// Default test env — PGlite suites override DATABASE_URL via setTestDatabase()
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'test-internal-key';
process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'test-token';

// Neon integration tests can use DATABASE_URL when NEON_DATABASE_URL is unset
if (!process.env.NEON_DATABASE_URL && process.env.DATABASE_URL?.includes('neon.tech')) {
  process.env.NEON_DATABASE_URL = process.env.DATABASE_URL;
}
