import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/index';

async function createCompanyAndAssign(businessId: string) {
  const company = await (
    await app.request('/api/v1/companies', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: `Co ${businessId}` }),
    })
  ).json();
  const assign = await app.request(`/api/v1/companies/${company.id}/businesses`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ businessId }),
  });
  expect(assign.status).toBe(200);
  return company;
}

async function createCustomer(businessId: string, name: string) {
  const res = await app.request(`/api/v1/${businessId}/customers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, phone: '555', email: `${name.toLowerCase()}@example.com` }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

describe('Customers API', () => {
  withPglite();

  it('returns 400 when the business has no company', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/customers`, { headers: authHeaders() });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not linked to a company/i);
  });

  it('customer CRUD through the linked company', async () => {
    const { business } = await seedTestWorld();
    await createCompanyAndAssign(business.id);
    const customer = await createCustomer(business.id, 'Jane');

    const list = await app.request(`/api/v1/${business.id}/customers`, { headers: authHeaders() });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.customers.map((c: { id: string }) => c.id)).toContain(customer.id);

    const put = await app.request(`/api/v1/${business.id}/customers/${customer.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ phone: '999' }),
    });
    expect(put.status).toBe(200);

    const del = await app.request(`/api/v1/${business.id}/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(del.status).toBe(200);
  });

  it('product create rejects customers from another company', async () => {
    const { business } = await seedTestWorld();
    await createCompanyAndAssign(business.id);
    const customer = await createCustomer(business.id, 'Owned');

    const ok = await app.request(`/api/v1/${business.id}/products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'Customer Tee',
        price: 15,
        sku: 'CT-1',
        customerId: customer.id,
        variants: [],
      }),
    });
    expect(ok.status).toBe(201);

    const foreign = await app.request(`/api/v1/${business.id}/products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'Bad Link',
        price: 15,
        sku: 'CT-2',
        customerId: crypto.randomUUID(),
        variants: [],
      }),
    });
    expect(foreign.status).toBe(400);
  });

  it('product list and detail expose the linked customer', async () => {
    const { business } = await seedTestWorld();
    await createCompanyAndAssign(business.id);
    const customer = await createCustomer(business.id, 'Shown');
    const product = await (
      await app.request(`/api/v1/${business.id}/products`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Badge Tee', price: 9, sku: 'BT-1', customerId: customer.id, variants: [] }),
      })
    ).json();

    const list = await (
      await app.request(`/api/v1/${business.id}/products`, { headers: authHeaders() })
    ).json();
    const item = list.products.find((p: { id: string }) => p.id === product.id);
    expect(item.customerId).toBe(customer.id);
    expect(item.customerName).toBe('Shown');

    const detail = await (
      await app.request(`/api/v1/${business.id}/products/${product.id}`, { headers: authHeaders() })
    ).json();
    expect(detail.customer).toEqual({ id: customer.id, name: 'Shown' });

    const unlink = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ customerId: null }),
    });
    expect(unlink.status).toBe(200);
    const after = await (
      await app.request(`/api/v1/${business.id}/products/${product.id}`, { headers: authHeaders() })
    ).json();
    expect(after.customer).toBeNull();
  });

  it('legacy product payloads without customerId still work', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Plain Tee', price: 12, sku: 'PT-1', variants: [] }),
    });
    expect(res.status).toBe(201);
  });
});
