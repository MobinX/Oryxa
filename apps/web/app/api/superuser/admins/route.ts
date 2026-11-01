import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-base';
import { getConsoleToken } from '@/lib/console-cookie';

async function proxy(path: string, init: RequestInit = {}): Promise<NextResponse> {
  const token = await getConsoleToken();
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }
  const text = await upstream.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }
  return NextResponse.json(body ?? {}, { status: upstream.status });
}

export async function GET() {
  return await proxy('/api2/superuser/admins');
}

export async function POST(request: Request) {
  const body = await request.text();
  return await proxy('/api2/superuser/admins', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
