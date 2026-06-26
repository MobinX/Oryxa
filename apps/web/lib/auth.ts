import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const AUTH_COOKIE = 'oryxa_token';

const COOKIE_MAX_AGE = 60 * 60; // 1 hour — matches Firebase ID token lifetime

export async function getAuthToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value ?? null;
}

export async function requireAuth(): Promise<string> {
  const token = await getAuthToken();
  if (!token) redirect('/login');
  return token;
}

export async function setAuthCookie(token: string) {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
