import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { syncUser, getUserByFirebaseUid, getUserById } from '@repo/db/crud/user';
import { TEST_FIREBASE_UID } from '../helpers/seed';

describe('User CRUD', () => {
  withPglite();

  it('syncUser creates a new user', async () => {
    const user = await syncUser({
      firebaseUid: 'new-uid-1',
      name: 'Alice',
      email: 'alice@test.com',
      signInMethod: 'google',
    });
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Alice');
  });

  it('syncUser updates existing user', async () => {
    await syncUser({ firebaseUid: 'upd-uid', name: 'Bob', signInMethod: 'google' });
    const updated = await syncUser({
      firebaseUid: 'upd-uid',
      name: 'Bobby',
      email: 'bobby@test.com',
      signInMethod: 'google',
    });
    expect(updated.name).toBe('Bobby');
    expect(updated.email).toBe('bobby@test.com');
  });

  it('getUserByFirebaseUid finds user', async () => {
    await syncUser({ firebaseUid: TEST_FIREBASE_UID, name: 'Test', signInMethod: 'google' });
    const user = await getUserByFirebaseUid(TEST_FIREBASE_UID);
    expect(user?.firebaseUid).toBe(TEST_FIREBASE_UID);
  });

  it('getUserById returns user', async () => {
    const created = await syncUser({ firebaseUid: 'by-id-uid', name: 'Carl', signInMethod: 'google' });
    const user = await getUserById(created.id);
    expect(user?.id).toBe(created.id);
  });

  it('getUserByFirebaseUid returns undefined for unknown uid', async () => {
    const user = await getUserByFirebaseUid('does-not-exist');
    expect(user).toBeUndefined();
  });
});
