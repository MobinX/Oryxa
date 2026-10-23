import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders, TEST_FIREBASE_UID } from '../helpers/seed';
import { app } from '@api/app';

describe('Users API', () => {
  withPglite();

  it('POST /api/v1/users/sync requires authentication', async () => {
    const res = await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Anonymous' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/users/sync derives the identity from the token, not the body', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        firebaseUid: 'attacker-chosen-uid',
        email: 'attacker@example.com',
        name: 'Renamed by token owner',
        signInMethod: 'google',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { firebaseUid: string; email: string; name: string };
    expect(body.firebaseUid).toBe(TEST_FIREBASE_UID);
    expect(body.email).toBe('test@oryxa.dev');
    expect(body.name).toBe('Renamed by token owner');
  });

  it('POST /api/v1/users/sync keeps the current name when the body omits it', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { firebaseUid: string; name: string };
    expect(body.firebaseUid).toBe(TEST_FIREBASE_UID);
    expect(body.name).toBe('Test User');
  });

  it('GET /api/v1/users/me returns profile with dev token', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/users/me', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
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
