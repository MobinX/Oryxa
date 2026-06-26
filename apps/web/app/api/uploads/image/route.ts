import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const runtime = 'nodejs';
// Route handlers stream the body, so this is independent of the server-action
// 1MB cap. Allow up to the API's 4MB image limit plus multipart overhead.
export const maxDuration = 30;

/**
 * Fallback upload path used when the browser cannot PUT directly to B2
 * (e.g. B2 bucket CORS not configured for the current origin, which is common
 * in GitHub Codespaces where the web URL is dynamic). The browser POSTs the
 * file here (same-origin, httpOnly auth cookie sent automatically) and this
 * route forwards it to the API's /uploads/image endpoint server-side. The
 * API then uploads to B2 — server-to-server, so no browser CORS applies.
 *
 * Bytes do flow through Next.js on this path (unlike the direct PUT path),
 * so it is only used when the direct path fails.
 */
export async function POST(req: Request) {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${AUTH_COOKIE}=`))
    ?.split('=')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const businessId = url.searchParams.get('businessId');
  if (!businessId) {
    return NextResponse.json({ error: 'businessId query parameter is required' }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file);

  const upstream = await fetch(`${API_URL}/api/v1/${businessId}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: upstreamForm,
  });

  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}
