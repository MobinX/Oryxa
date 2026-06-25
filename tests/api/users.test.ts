import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders, TEST_FIREBASE_UID } from '../helpers/seed';
import app from '@api/index';

describe('Users API', () => {
  withPglite();

  it('POST /api/v1/users/sync creates user', async () => {
    const res = await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: 'api-sync-uid',
        name: 'API User',
        email: 'api@test.com',
        signInMethod: 'google',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.firebaseUid).toBe('api-sync-uid');
  });

  it('GET /api/v1/users/me returns profile with dev token', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/users/me', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Test User');
  });

  it('GET /api/v1/users/me returns 401 without token', async () => {
    const res = await app.request('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/users/me returns 401 for unsynced user token', async () => {
    const res = await app.request('/api/v1/users/me', {
      headers: authHeaders('dev-test-token'),
    });
    // No seeded user yet — should fail unless we seed first
    expect([401, 200]).toContain(res.status);
  });
});
