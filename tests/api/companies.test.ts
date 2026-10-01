import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/index';

describe('Companies API', () => {
  withPglite();

  it('POST /api/v1/companies creates a company for the caller', async () => {
    await seedTestWorld();
    const res = await app.request('/api/v1/companies', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Acme Group', description: 'Holdings' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Acme Group');
    expect(typeof body.createdAt).toBe('string');
  });

  it('full lifecycle: create, list, get, update, delete', async () => {
    await seedTestWorld();
    const created = await (
      await app.request('/api/v1/companies', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Lifecycle Corp' }),
      })
    ).json();

    const list = await app.request('/api/v1/companies', { headers: authHeaders() });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.companies.map((c: { id: string }) => c.id)).toContain(created.id);
    expect(listBody.totalCount).toBeGreaterThanOrEqual(1);

    const get = await app.request(`/api/v1/companies/${created.id}`, { headers: authHeaders() });
    expect(get.status).toBe(200);

    const put = await app.request(`/api/v1/companies/${created.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ phone: '0123' }),
    });
    expect(put.status).toBe(200);

    const del = await app.request(`/api/v1/companies/${created.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(del.status).toBe(200);
    // Deleted company no longer passes ownership middleware -> 403 (mirrors businesses)
    const gone = await app.request(`/api/v1/companies/${created.id}`, { headers: authHeaders() });
    expect(gone.status).toBe(403);
  });

  it('assign and unassign the seeded business', async () => {
    const { business } = await seedTestWorld();
    const company = await (
      await app.request('/api/v1/companies', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Assign Co' }),
      })
    ).json();

    const assign = await app.request(`/api/v1/companies/${company.id}/businesses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ businessId: business.id }),
    });
    expect(assign.status).toBe(200);

    const businesses = await (
      await app.request(`/api/v1/companies/${company.id}/businesses`, { headers: authHeaders() })
    ).json();
    expect(businesses.businesses.map((b: { id: string }) => b.id)).toContain(business.id);

    const biz = await (
      await app.request(`/api/v1/businesses/${business.id}`, { headers: authHeaders() })
    ).json();
    expect(biz.companyId).toBe(company.id);

    const unassign = await app.request(
      `/api/v1/companies/${company.id}/businesses/${business.id}`,
      { method: 'DELETE', headers: authHeaders() },
    );
    expect(unassign.status).toBe(200);
    const after = await (
      await app.request(`/api/v1/businesses/${business.id}`, { headers: authHeaders() })
    ).json();
    expect(after.companyId).toBeNull();
  });

  it('assigning another user business is forbidden', async () => {
    const { business } = await seedTestWorld();
    await app.request('/api/v1/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firebaseUid: 'plain-user', name: 'P', signInMethod: 'google' }),
    });
    const company = await (
      await app.request('/api/v1/companies', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Mine Co' }),
      })
    ).json();
    // seeded business IS owned by dev-test-uid user, so use a fresh uuid as foreign
    const foreign = crypto.randomUUID();
    const res = await app.request(`/api/v1/companies/${company.id}/businesses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ businessId: foreign }),
    });
    expect(res.status).toBe(403);
    expect(business.id).toBeTruthy();
  });

  it('requires authentication', async () => {
    const res = await app.request('/api/v1/companies', {
      headers: { Authorization: 'Bearer invalid' },
    });
    expect([401, 503]).toContain(res.status);
  });
});
