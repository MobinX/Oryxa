import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { logsOperatorPassword } from '@api/middleware/logs-access';

/** The console API sits behind the logs gate: no bearer, no data — for every route family. */
const PATHS = [
  { path: '/api2/admin/ai/channels', method: 'GET' },
  { path: '/api2/admin/ai/businesses/0f0a9b1c-1111-4000-8000-000000000001/profile', method: 'GET' },
  { path: '/api2/admin/ai/businesses/0f0a9b1c-1111-4000-8000-000000000001/capacity', method: 'GET' },
  { path: '/api2/admin/ai/leads', method: 'GET' },
  { path: '/api2/admin/ai/inbox', method: 'GET' },
  { path: '/api2/admin/ai/whatsapp/connect', method: 'POST' },
  { path: '/api2/admin/ai/channels/not-a-uuid/config', method: 'GET' },
];

describe('admin AI console auth gate', () => {
  beforeAll(() => {
    // Beyond the allowlist bypass: with any allowlist configured, only the operator
    // secret or an allowlisted Firebase user opens these routes.
    process.env.LOG_QUERY_USER_IDS = '00000000-0000-4000-8000-000000000000';
  });

  afterAll(() => {
    delete process.env.LOG_QUERY_USER_IDS;
  });

  withPglite();

  for (const { path, method } of PATHS) {
    it(`${method} ${path} rejects an anonymous caller`, async () => {
      const res = await app.request(`http://localhost${path}`, { method });
      expect([401, 403, 503]).toContain(res.status);
    });

    it(`${method} ${path} rejects a wrong bearer`, async () => {
      const res = await app.request(`http://localhost${path}`, {
        method,
        headers: { Authorization: 'Bearer not-the-password' },
      });
      expect([401, 403, 503]).toContain(res.status);
    });

    it(`${method} ${path} passes the gate with the logs operator password`, async () => {
      const res = await app.request(`http://localhost${path}`, {
        method,
        headers: { Authorization: `Bearer ${logsOperatorPassword()}` },
      });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  }
});
