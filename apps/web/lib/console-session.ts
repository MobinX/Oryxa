import { cache } from 'react';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from './api-base';
import { getConsoleToken } from './console-cookie';
import {
  CONSOLE_CAPABILITIES,
  firstAllowedAdminHref,
  type ConsoleUser,
} from './console-capabilities';
import { hasLogsSession, logsBearer, operatorAccountEmail } from './logs-session';

export class ConsoleApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ConsoleApiError';
  }
}

export const getConsoleUser = cache(async (): Promise<ConsoleUser | null> => {
  const token = await getConsoleToken();
  if (!token) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/api2/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: ConsoleUser };
    return body.user ?? null;
  } catch {
    return null;
  }
});

export const getActiveConsoleUser = cache(async (): Promise<ConsoleUser | null> => {
  const user = await getConsoleUser();
  if (user) return user;
  if (await hasLogsSession()) {
    return {
      id: 'legacy-operator',
      email: operatorAccountEmail(),
      name: 'Operator',
      role: 'superuser',
      capabilities: [...CONSOLE_CAPABILITIES],
      isActive: true,
      legacy: true,
    };
  }
  return null;
});

export async function requireConsoleUser(): Promise<ConsoleUser> {
  const user = await getActiveConsoleUser();
  if (!user) redirect('/admin/login');
  return user;
}

export async function requireSuperuser(): Promise<ConsoleUser> {
  const user = await getActiveConsoleUser();
  if (!user || user.legacy || user.role !== 'superuser') redirect('/superuser/login');
  return user;
}

export function consoleLanding(user: ConsoleUser | null | undefined): string {
  return firstAllowedAdminHref(user);
}

export async function consoleApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await logsBearer();
  if (!token) throw new ConsoleApiError('Not signed in', 401);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const payload = body as { error?: string } | null;
    throw new ConsoleApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return body as T;
}
