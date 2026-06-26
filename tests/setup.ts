import 'dotenv/config';

// Test env overrides — .env may set production values that break unit tests
process.env.NODE_ENV = 'test';
process.env.INTERNAL_KEY = 'test-internal-key';
process.env.META_VERIFY_TOKEN = 'test-token';
process.env.META_APP_SECRET = process.env.META_APP_SECRET ?? 'test-app-secret';
process.env.WEB_URL = 'http://localhost:3400';
process.env.AGENT_RUNNER_URL = process.env.AGENT_RUNNER_URL ?? 'http://localhost:3001';

// Neon integration tests can use DATABASE_URL when NEON_DATABASE_URL is unset
if (!process.env.NEON_DATABASE_URL && process.env.DATABASE_URL?.includes('neon.tech')) {
  process.env.NEON_DATABASE_URL = process.env.DATABASE_URL;
}
