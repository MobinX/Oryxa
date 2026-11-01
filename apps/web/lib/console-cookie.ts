import { cookies } from 'next/headers';

export const CONSOLE_COOKIE = 'oryxa_console_session';
export const CONSOLE_MAX_AGE = 12 * 60 * 60;

export function consoleCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: CONSOLE_MAX_AGE,
  };
}

export async function getConsoleToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CONSOLE_COOKIE)?.value ?? null;
}

export async function setConsoleCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CONSOLE_COOKIE, token, consoleCookieOptions());
}

export async function clearConsoleCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CONSOLE_COOKIE);
}
