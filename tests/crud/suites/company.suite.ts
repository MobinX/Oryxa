import { it, expect } from 'vitest';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness, getBusinessById } from '@repo/db/crud/business';
import {
  createCompany,
  getCompanyById,
  listCompaniesByUserId,
  updateCompany,
  deleteCompany,
  verifyCompanyOwnership,
  listCompanyBusinesses,
  assignBusinessToCompany,
  unassignBusiness,
} from '@repo/db/crud/company';

async function ownerWithCompany() {
  const user = await syncUser({
    firebaseUid: `company-uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Owner',
    signInMethod: 'google',
  });
  const company = await createCompany(user.id, { name: 'Acme Group', phone: '0100' });
  return { user, company };
}

export function registerCompanyCrudTests() {
  it('createCompany persists owner and fields', async () => {
    const { user, company } = await ownerWithCompany();
    expect(company.name).toBe('Acme Group');
    expect(company.userId).toBe(user.id);
    const fetched = await getCompanyById(company.id);
    expect(fetched?.name).toBe('Acme Group');
  });

  it('listCompaniesByUserId returns only the caller companies', async () => {
    const { user, company } = await ownerWithCompany();
    const other = await syncUser({ firebaseUid: `other-${Date.now()}`, name: 'X', signInMethod: 'google' });
    await createCompany(other.id, { name: 'Not Mine' });
    const list = await listCompaniesByUserId(user.id);
    expect(list.map((c) => c.id)).toEqual([company.id]);
  });

  it('assign links business and unassign clears it', async () => {
    const { user, company } = await ownerWithCompany();
    const business = await createBusiness(user.id, { name: 'Shop' });

    const assign = await assignBusinessToCompany(company.id, user.id, business.id);
    expect(assign).toEqual({ success: true });
    expect((await getBusinessById(business.id))?.companyId).toBe(company.id);
    expect((await listCompanyBusinesses(company.id)).map((b) => b.id)).toContain(business.id);

    const unassign = await unassignBusiness(business.id, user.id);
    expect(unassign).toEqual({ success: true });
    expect((await getBusinessById(business.id))?.companyId).toBeNull();
  });

  it('assign rejects a business owned by another user', async () => {
    const { user, company } = await ownerWithCompany();
    const other = await syncUser({ firebaseUid: `fo-${Date.now()}`, name: 'F', signInMethod: 'google' });
    const foreign = await createBusiness(other.id, { name: 'Foreign' });
    const result = await assignBusinessToCompany(company.id, user.id, foreign.id);
    expect(result).toEqual({ error: 'business' });
  });

  it('update/delete verify ownership', async () => {
    const { user, company } = await ownerWithCompany();
    const other = await syncUser({ firebaseUid: `fo2-${Date.now()}`, name: 'F', signInMethod: 'google' });

    expect(await verifyCompanyOwnership(company.id, user.id)).toBe(true);
    expect(await verifyCompanyOwnership(company.id, other.id)).toBe(false);
    expect(await updateCompany(company.id, other.id, { name: 'Hijack' })).toBeNull();
    expect(await updateCompany(company.id, user.id, { name: 'Renamed' })).toEqual({ success: true });
    expect((await getCompanyById(company.id))?.name).toBe('Renamed');
    expect(await deleteCompany(company.id, other.id)).toBeNull();
    expect(await deleteCompany(company.id, user.id)).toEqual({ deleted: true });
    expect(await getCompanyById(company.id)).toBeUndefined();
  });
}
