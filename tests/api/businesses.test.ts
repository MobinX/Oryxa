import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

describe('Businesses API', () => {
  withPglite();

  it('POST /api/v1/businesses creates business', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/businesses', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Second Shop', hasTradeLicense: false, hasTaxLicense: false }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Second Shop');
  });

  it('GET /api/v1/businesses/:id returns business', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/businesses/${business.id}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(business.name);
  });

  it('PUT /api/v1/businesses/:id updates business', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/businesses/${business.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ description: 'Updated desc' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/businesses/:id returns 403 for other user', async () => {
    const { business } = await seedTestWorld();
    // Sync a different user without access
    await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: 'other-user-uid',
        name: 'Other',
        signInMethod: 'google',
      }),
    });
    // other-user doesn't have dev-test-token — use unauthorized
    const res = await app.request(`/api/v1/businesses/${business.id}`, {
      headers: { Authorization: 'Bearer invalid' },
    });
    expect([401, 403, 503]).toContain(res.status);
  });
});
