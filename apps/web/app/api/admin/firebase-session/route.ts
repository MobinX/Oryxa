import { NextResponse } from 'next/server';
import { OPERATOR_AUTH_COOKIE } from '@/lib/admin-access';
import { API_BASE_URL } from '@/lib/api-base';
import { getConsoleToken } from '@/lib/console-cookie';
import { verifyOperatorToken } from '@/lib/operator-login';

export async function POST(request: Request) {
  const consoleToken = await getConsoleToken();
  if (!consoleToken) {
    return NextResponse.json({ error: 'Admin sign-in required' }, { status: 401 });
  }
  try {
    const me = await fetch(`${API_BASE_URL}/api2/admin/me`, {
      headers: { Authorization: `Bearer ${consoleToken}` },
      cache: 'no-store',
    });
    if (!me.ok) return NextResponse.json({ error: 'Admin session is invalid' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }

  const expected = process.env.ADMIN_FALLBACK_FIREBASE_EMAIL?.trim().toLowerCase();
  if (!expected) {
    return NextResponse.json({ error: 'ADMIN_FALLBACK_FIREBASE_EMAIL is not configured' }, { status: 503 });
  }
  let body: { idToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.idToken !== 'string' || !body.idToken) {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  const verified = await verifyOperatorToken(body.idToken);
  if (!verified?.email || verified.email.trim().toLowerCase() !== expected) {
    return NextResponse.json({ error: 'Unexpected Firebase account' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPERATOR_AUTH_COOKIE, body.idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
