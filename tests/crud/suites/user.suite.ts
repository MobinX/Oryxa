import { it, expect } from 'vitest';
import { syncUser, getUserByFirebaseUid, getUserById } from '@repo/db/crud/user';
import { TEST_FIREBASE_UID } from '../../helpers/seed';

export function registerUserCrudTests() {
  it('syncUser creates a new user', async () => {
    const suffix = Date.now();
    const user = await syncUser({
      firebaseUid: `new-uid-${suffix}`,
      name: 'Alice',
      email: `alice-${suffix}@test.com`,
      signInMethod: 'google',
    });
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Alice');
  });

  it('syncUser updates existing user', async () => {
    const uid = `upd-uid-${Date.now()}`;
    const email = `bobby-${Date.now()}@test.com`;
    await syncUser({ firebaseUid: uid, name: 'Bob', signInMethod: 'google' });
    const updated = await syncUser({
      firebaseUid: uid,
      name: 'Bobby',
      email,
      signInMethod: 'google',
    });
    expect(updated.name).toBe('Bobby');
    expect(updated.email).toBe(email);
  });

  it('getUserByFirebaseUid finds user', async () => {
    const uid = `find-uid-${Date.now()}`;
    await syncUser({ firebaseUid: uid, name: 'Test', signInMethod: 'google' });
    const user = await getUserByFirebaseUid(uid);
    expect(user?.firebaseUid).toBe(uid);
  });

  it('getUserById returns user', async () => {
    const created = await syncUser({
      firebaseUid: `by-id-uid-${Date.now()}`,
      name: 'Carl',
      signInMethod: 'google',
    });
    const user = await getUserById(created.id);
    expect(user?.id).toBe(created.id);
  });

  it('getUserByFirebaseUid returns undefined for unknown uid', async () => {
    const user = await getUserByFirebaseUid(`does-not-exist-${Date.now()}`);
    expect(user).toBeUndefined();
  });
}
