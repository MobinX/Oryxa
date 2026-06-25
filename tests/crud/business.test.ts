import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { syncUser } from '@repo/db/crud/user';
import {
  createBusiness,
  getBusinessById,
  updateBusiness,
  verifyBusinessOwnership,
} from '@repo/db/crud/business';

describe('Business CRUD', () => {
  withPglite();

  it('createBusiness provisions workspace', async () => {
    const user = await syncUser({ firebaseUid: 'biz-uid', name: 'Owner', signInMethod: 'google' });
    const business = await createBusiness(user.id, {
      name: 'My Shop',
      description: 'Selling things',
      hasTradeLicense: true,
      hasTaxLicense: false,
    });
    expect(business.name).toBe('My Shop');
    expect(business.userId).toBe(user.id);
  });

  it('getBusinessById returns business', async () => {
    const user = await syncUser({ firebaseUid: 'get-biz-uid', name: 'Owner', signInMethod: 'google' });
    const created = await createBusiness(user.id, { name: 'Shop', hasTradeLicense: false, hasTaxLicense: false });
    const business = await getBusinessById(created.id);
    expect(business?.id).toBe(created.id);
  });

  it('updateBusiness updates fields', async () => {
    const user = await syncUser({ firebaseUid: 'upd-biz-uid', name: 'Owner', signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: 'Old', hasTradeLicense: false, hasTaxLicense: false });
    const result = await updateBusiness(business.id, user.id, { name: 'New Name' });
    expect(result?.success).toBe(true);
    const updated = await getBusinessById(business.id);
    expect(updated?.name).toBe('New Name');
  });

  it('updateBusiness returns null for wrong owner', async () => {
    const owner = await syncUser({ firebaseUid: 'owner-uid', name: 'Owner', signInMethod: 'google' });
    const other = await syncUser({ firebaseUid: 'other-uid', name: 'Other', signInMethod: 'google' });
    const business = await createBusiness(owner.id, { name: 'Shop', hasTradeLicense: false, hasTaxLicense: false });
    const result = await updateBusiness(business.id, other.id, { name: 'Hacked' });
    expect(result).toBeNull();
  });

  it('verifyBusinessOwnership checks access', async () => {
    const user = await syncUser({ firebaseUid: 'verify-uid', name: 'Owner', signInMethod: 'google' });
    const business = await createBusiness(user.id, { name: 'Shop', hasTradeLicense: false, hasTaxLicense: false });
    expect(await verifyBusinessOwnership(business.id, user.id)).toBe(true);
    expect(await verifyBusinessOwnership(business.id, '00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
