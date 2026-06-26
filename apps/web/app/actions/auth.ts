'use server';

import { redirect } from 'next/navigation';
import { clearAuthCookie, setAuthCookie } from '@/lib/auth';
import { syncUser } from '@/lib/api';

export async function setAuthSession(
  idToken: string,
  profile: {
    firebaseUid: string;
    name: string;
    email?: string;
  },
) {
  await setAuthCookie(idToken);
  await syncUser({
    firebaseUid: profile.firebaseUid,
    name: profile.name,
    email: profile.email,
    signInMethod: 'google',
  });
  redirect('/businesses');
}

export async function signOutAction() {
  await clearAuthCookie();
  redirect('/login');
}
