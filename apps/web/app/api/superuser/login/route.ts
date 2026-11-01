import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-base';
import { CONSOLE_COOKIE, consoleCookieOptions } from '@/lib/console-cookie';

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api2/superuser/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }
  const data = (await upstream.json().catch(() => ({}))) as {
    error?: string;
    token?: string;
    user?: Record<string, unknown>;
  };
  if (!upstream.ok || !data.token) {
    return NextResponse.json({ error: data.error || 'Sign-in failed' }, { status: upstream.status || 401 });
  }

  const response = NextResponse.json({ ok: true, user: data.user });
  response.cookies.set(CONSOLE_COOKIE, data.token, consoleCookieOptions());
  return response;
}
