import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { OPERATOR_AUTH_COOKIE } from '@/lib/admin-access';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Forwards the sign request to the API using the httpOnly auth cookie or Authorization header.
 * The browser can't read the cookie to set Authorization itself, so this
 * tiny proxy adds the bearer token server-side. Only the small JSON sign
 * payload crosses this route — image bytes go directly from the browser
 * to B2 via the returned presigned PUT URL.
 */
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const url = new URL(req.url);
  const businessId = url.searchParams.get('businessId');
  if (!businessId) {
    return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/v1/${businessId}/uploads/sign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}
