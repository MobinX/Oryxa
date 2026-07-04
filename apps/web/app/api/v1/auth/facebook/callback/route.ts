import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = url.searchParams.toString();
  const upstreamUrl = `${API_URL}/api/v1/auth/facebook/callback${searchParams ? `?${searchParams}` : ''}`;

  try {
    const res = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'manual', // Let the browser handle the redirect rather than fetch following it on the server
    });

    const headers = new Headers();
    res.headers.forEach((value, key) => {
      // Skip forwarding transfer/encoding headers
      if (['connection', 'content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        return;
      }
      headers.set(key, value);
    });

    const isRedirect = [301, 302, 307, 308].includes(res.status);
    const body = isRedirect ? null : await res.text();

    return new Response(body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    console.error('Error proxying Facebook OAuth callback:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
