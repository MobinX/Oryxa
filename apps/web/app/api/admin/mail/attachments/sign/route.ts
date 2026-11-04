import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-base';
import { getConsoleToken } from '@/lib/console-cookie';

export async function POST(request: Request) {
  const token = await getConsoleToken();
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api2/admin/mail/attachments/sign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({ error: 'Sign failed' }));
  return NextResponse.json(data, { status: upstream.status });
}
