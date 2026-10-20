import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';
import { OPERATOR_AUTH_COOKIE } from '@/lib/admin-access';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Cookie → bearer for the merchant's Messenger notification portal (read and create). */
function bearerFrom(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();

  const cookies = req.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim()) ?? [];
  return (
    cookies.find((s) => s.startsWith(`${AUTH_COOKIE}=`))?.split('=')[1] ??
    cookies.find((s) => s.startsWith(`${OPERATOR_AUTH_COOKIE}=`))?.split('=')[1] ??
    null
  );
}

function upstreamUrl(req: Request): string | null {
  const businessId = new URL(req.url).searchParams.get('businessId');
  if (!businessId) return null;
  return `${API_URL}/api/v1/${businessId}/messenger-notifications`;
}

export async function GET(req: Request) {
  const token = bearerFrom(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = upstreamUrl(req);
  if (!url) return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });

  const upstream = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}

export async function POST(req: Request) {
  const token = bearerFrom(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = upstreamUrl(req);
  if (!url) return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}

/** Unlinks one connected account; the id travels as a query parameter. */
export async function DELETE(req: Request) {
  const token = bearerFrom(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = upstreamUrl(req);
  if (!url) return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });

  const upstream = await fetch(`${url}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}
