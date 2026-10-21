import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { OPERATOR_AUTH_COOKIE } from '@/lib/admin-access';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Fires one test push at this business's registered browsers, with the auth cookie's token. */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    const cookies = req.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim()) ?? [];

    token = cookies
      .find((s) => s.startsWith(`${AUTH_COOKIE}=`))
      ?.split('=')[1] ?? null;

    if (!token) {
      token = cookies
        .find((s) => s.startsWith(`${OPERATOR_AUTH_COOKIE}=`))
        ?.split('=')[1] ?? null;
    }
  }

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const businessId = new URL(req.url).searchParams.get('businessId');
  if (!businessId) {
    return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/v1/${businessId}/push/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}
