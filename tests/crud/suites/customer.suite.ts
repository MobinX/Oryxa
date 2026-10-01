import { it, expect } from 'vitest';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness } from '@repo/db/crud/business';
import { createCompany, assignBusinessToCompany } from '@repo/db/crud/company';
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCompanyIdForBusiness,
  isCustomerInBusinessCompany,
} from '@repo/db/crud/customer';

async function companyWithBusiness() {
  const user = await syncUser({
    firebaseUid: `cust-uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Owner',
    signInMethod: 'google',
  });
  const company = await createCompany(user.id, { name: 'Acme' });
  const business = await createBusiness(user.id, { name: 'Shop' });
  await assignBusinessToCompany(company.id, user.id, business.id);
  return { user, company, business };
}

export function registerCustomerCrudTests() {
  it('customer CRUD is scoped to its company', async () => {
    const { company } = await companyWithBusiness();
    const customer = await createCustomer(company.id, {
      name: 'John Doe',
      phone: '555',
      email: 'john@example.com',
    });
    expect(customer.name).toBe('John Doe');
    expect(customer.companyId).toBe(company.id);

    const list = await listCustomers(company.id);
    expect(list.customers.map((c) => c.id)).toContain(customer.id);
    expect(list.totalCount).toBe(1);

    expect(await updateCustomer(customer.id, company.id, { phone: '999' })).toEqual({ success: true });
    expect((await getCustomerById(customer.id))?.phone).toBe('999');
    expect(await deleteCustomer(customer.id, company.id)).toEqual({ deleted: true });
  });

  it('cross-company access is rejected', async () => {
    const a = await companyWithBusiness();
    const b = await companyWithBusiness();
    const customer = await createCustomer(a.company.id, { name: 'Only A' });

    expect(await getCompanyIdForBusiness(b.business.id)).toBe(b.company.id);
    expect(await isCustomerInBusinessCompany(customer.id, b.business.id)).toBe(false);
    expect(await isCustomerInBusinessCompany(customer.id, a.business.id)).toBe(true);
    expect(await updateCustomer(customer.id, b.company.id, { name: 'Hijack' })).toBeNull();
    expect(await deleteCustomer(customer.id, b.company.id)).toBeNull();
  });

  it('business without company resolves null and rejects customer links', async () => {
    const user = await syncUser({ firebaseUid: `nc-${Date.now()}`, name: 'O', signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: 'Lonely Shop' });
    const company = await createCompany(user.id, { name: 'Some Corp' });
    const customer = await createCustomer(company.id, { name: 'C' });

    expect(await getCompanyIdForBusiness(business.id)).toBeNull();
    expect(await isCustomerInBusinessCompany(customer.id, business.id)).toBe(false);
  });

  it('search filters customers by name', async () => {
    const { company } = await companyWithBusiness();
    await createCustomer(company.id, { name: 'Alice' });
    await createCustomer(company.id, { name: 'Bob' });
    const found = await listCustomers(company.id, { search: 'Ali' });
    expect(found.customers.map((c) => c.name)).toEqual(['Alice']);
  });
}
