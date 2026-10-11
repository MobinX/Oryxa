import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

type CompanyBody = { id: string; name: string };
type CustomerBody = { id: string; name: string };
type CustomerListBody = { customers: CustomerBody[]; totalCount: number };
type CreatedBody = { id: string };
type ProductListBody = { products: Array<{ id: string; customerId: string | null; customerName: string | null }> };
type ProductDetailBody = { customer: { id: string; name: string } | null };
type OrderBody = { id: string; customerId: string | null };
type HistoryBody = {
  customer: { id: string; name: string; phone: string | null; address: string | null };
  orders: Array<{ id: string; storeName: string; productName: string | null; count: number; totalPrice: number }>;
  purchases: Array<{ productId: string; productName: string; orders: number; units: number; spent: number }>;
  stats: { orders: number; units: number; spent: number };
};

/** The one thing `Response.json()` cannot say about itself. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function createCompanyAndAssign(businessId: string) {
  const company = await json<CompanyBody>(
    await app.request('/api/v1/companies', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: `Co ${businessId}` }),
    }),
  );
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
  return json<CustomerBody>(res);
}

describe('Customers API', () => {
  withPglite();

  it('returns 400 when the business has no company', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/customers`, { headers: authHeaders() });
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toMatch(/not linked to a company/i);
  });

  it('customer CRUD through the linked company', async () => {
    const { business } = await seedTestWorld();
    await createCompanyAndAssign(business.id);
    const customer = await createCustomer(business.id, 'Jane');

    const list = await app.request(`/api/v1/${business.id}/customers`, { headers: authHeaders() });
    expect(list.status).toBe(200);
    const listBody = await json<CustomerListBody>(list);
    expect(listBody.customers.map((c) => c.id)).toContain(customer.id);

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
    const product = await json<CreatedBody>(
      await app.request(`/api/v1/${business.id}/products`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Badge Tee', price: 9, sku: 'BT-1', customerId: customer.id, variants: [] }),
      }),
    );

    const list = await json<ProductListBody>(
      await app.request(`/api/v1/${business.id}/products`, { headers: authHeaders() }),
    );
    const item = list.products.find((p) => p.id === product.id);
    expect(item?.customerId).toBe(customer.id);
    expect(item?.customerName).toBe('Shown');

    const detail = await json<ProductDetailBody>(
      await app.request(`/api/v1/${business.id}/products/${product.id}`, { headers: authHeaders() }),
    );
    expect(detail.customer).toEqual({ id: customer.id, name: 'Shown' });

    const unlink = await app.request(`/api/v1/${business.id}/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ customerId: null }),
    });
    expect(unlink.status).toBe(200);
    const after = await json<ProductDetailBody>(
      await app.request(`/api/v1/${business.id}/products/${product.id}`, { headers: authHeaders() }),
    );
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

  it('one phone number is one customer, however it is typed', async () => {
    const { business, product, productDetail } = await seedTestWorld();
    await createCompanyAndAssign(business.id);

    const place = async (customerPhone: string, count = 1) =>
      json<OrderBody>(
        await app.request(`/api/v1/${business.id}/orders`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            productId: product.id,
            variantId: productDetail.variants[0].id,
            count,
            customerName: 'Ali',
            customerPhone,
            customerAddress: '12 Street',
          }),
        }),
      );

    const first = await place('+92 300 1234567');
    const second = await place('+92-300-123-4567', 2);
    expect(first.customerId).toBeTruthy();
    expect(second.customerId).toBe(first.customerId);

    const list = await json<CustomerListBody>(
      await app.request(`/api/v1/${business.id}/customers`, { headers: authHeaders() }),
    );
    expect(list.totalCount).toBe(1);
    expect(list.customers[0]).toMatchObject({ name: 'Ali', phone: '+923001234567' });

    const history = await json<HistoryBody>(
      await app.request(`/api/v1/${business.id}/customers/${first.customerId}`, {
        headers: authHeaders(),
      }),
    );
    expect(history.customer.address).toBe('12 Street');
    expect(history.stats).toMatchObject({ orders: 2, units: 3 });
    expect(history.stats.spent).toBeCloseTo(89.97);
    expect(history.orders[0].storeName).toBe(business.name);
    expect(history.purchases).toHaveLength(1);
    expect(history.purchases[0]).toMatchObject({ productName: 'Test T-Shirt', orders: 2, units: 3 });
  });

  it('a card is readable only inside its own company', async () => {
    const { business } = await seedTestWorld();
    await createCompanyAndAssign(business.id);
    const customer = await createCustomer(business.id, 'Private');

    const stranger = await seedTestWorld();
    const noCompany = await app.request(
      `/api/v1/${stranger.business.id}/customers/${customer.id}`,
      { headers: authHeaders() },
    );
    expect(noCompany.status).toBe(400);

    const missing = await app.request(
      `/api/v1/${business.id}/customers/${crypto.randomUUID()}`,
      { headers: authHeaders() },
    );
    expect(missing.status).toBe(404);
  });
});
