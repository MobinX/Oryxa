import { it, expect } from 'vitest';
import { syncUser } from '@repo/db/crud/user';
import {
  createBusiness,
  getBusinessById,
  updateBusiness,
  verifyBusinessOwnership,
} from '@repo/db/crud/business';

export function registerBusinessCrudTests() {
  it('createBusiness provisions workspace', async () => {
    const user = await syncUser({
      firebaseUid: `biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
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
    const user = await syncUser({
      firebaseUid: `get-biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const created = await createBusiness(user.id, {
      name: 'Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const business = await getBusinessById(created.id);
    expect(business?.id).toBe(created.id);
  });

  it('stores the region-based delivery charges', async () => {
    const user = await syncUser({
      firebaseUid: `zones-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const created = await createBusiness(user.id, {
      name: 'Zone Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const zones = [
      { label: 'Inside Dhaka', price: 60 },
      { label: 'Outside Dhaka', price: 120 },
    ];
    await updateBusiness(created.id, user.id, { deliveryZones: zones });
    const business = await getBusinessById(created.id);
    expect(business?.deliveryZones).toEqual(zones);
  });

  it('stores the merchant\'s payment methods with their account info', async () => {
    const user = await syncUser({
      firebaseUid: `pay-biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const created = await createBusiness(user.id, {
      name: 'Pay Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    // Nothing configured is today's behaviour: cash on delivery only.
    expect(created.paymentMethods).toEqual([]);

    const methods = [
      { name: 'bKash Personal', info: '01712-345678', requiresTransactionId: true },
      { name: 'Bank transfer' },
    ];
    await updateBusiness(created.id, user.id, { paymentMethods: methods });
    const business = await getBusinessById(created.id);
    expect(business?.paymentMethods).toEqual(methods);
  });

  it('stores the store-wide payment strategy, defaulting to cash on delivery', async () => {
    const user = await syncUser({
      firebaseUid: `strategy-biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const created = await createBusiness(user.id, {
      name: 'Strategy Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    expect(created.paymentStrategy).toBe('cod');

    await updateBusiness(created.id, user.id, { paymentStrategy: 'delivery_prepaid' });
    expect((await getBusinessById(created.id))?.paymentStrategy).toBe('delivery_prepaid');

    await updateBusiness(created.id, user.id, { paymentStrategy: 'full_prepaid' });
    expect((await getBusinessById(created.id))?.paymentStrategy).toBe('full_prepaid');
  });

  it('updateBusiness updates fields', async () => {
    const user = await syncUser({
      firebaseUid: `upd-biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const business = await createBusiness(user.id, {
      name: 'Old',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const result = await updateBusiness(business.id, user.id, { name: 'New Name' });
    expect(result?.success).toBe(true);
    const updated = await getBusinessById(business.id);
    expect(updated?.name).toBe('New Name');
  });

  it('updateBusiness switches the agent off and back on', async () => {
    const user = await syncUser({
      firebaseUid: `agent-biz-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const business = await createBusiness(user.id, {
      name: 'Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    expect(business.agentState).toBe(true);

    await updateBusiness(business.id, user.id, { agentState: false });
    expect((await getBusinessById(business.id))?.agentState).toBe(false);

    await updateBusiness(business.id, user.id, { agentState: true });
    expect((await getBusinessById(business.id))?.agentState).toBe(true);
  });

  it('updateBusiness returns null for wrong owner', async () => {
    const owner = await syncUser({
      firebaseUid: `owner-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const other = await syncUser({
      firebaseUid: `other-uid-${Date.now()}`,
      name: 'Other',
      signInMethod: 'google',
    });
    const business = await createBusiness(owner.id, {
      name: 'Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    const result = await updateBusiness(business.id, other.id, { name: 'Hacked' });
    expect(result).toBeNull();
  });

  it('verifyBusinessOwnership checks access', async () => {
    const user = await syncUser({
      firebaseUid: `verify-uid-${Date.now()}`,
      name: 'Owner',
      signInMethod: 'google',
    });
    const business = await createBusiness(user.id, {
      name: 'Shop',
      hasTradeLicense: false,
      hasTaxLicense: false,
    });
    expect(await verifyBusinessOwnership(business.id, user.id)).toBe(true);
    expect(await verifyBusinessOwnership(business.id, '00000000-0000-0000-0000-000000000000')).toBe(
      false,
    );
  });
}
