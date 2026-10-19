import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { OPERATOR_AUTH_COOKIE } from '@/lib/admin-access';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Forwards one page of a client-side catalog import to the API. The browser can't read the
 * httpOnly auth cookie to call the API itself, so this proxy adds the bearer token — only the
 * small JSON payload (product rows with B2 object keys) crosses here; image bytes went from the
 * browser straight to B2 already.
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

  const url = new URL(req.url);
  const businessId = url.searchParams.get('businessId');
  if (!businessId) {
    return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/api/v1/${businessId}/products/bulk`, {
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
