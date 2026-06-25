import 'dotenv/config';

// Default test env — PGlite suites override DATABASE_URL via setTestDatabase()
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.INTERNAL_KEY = process.env.INTERNAL_KEY ?? 'test-internal-key';
process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'test-token';
