import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = url.searchParams.toString();
  const upstreamUrl = `${API_URL}/webhooks/facebook${searchParams ? `?${searchParams}` : ''}`;

  try {
    const res = await fetch(upstreamUrl, {
      method: 'GET',
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (err) {
    console.error('Error proxying Facebook webhook GET:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const upstreamUrl = `${API_URL}/webhooks/facebook`;

  // Get raw body to verify signature on the backend
  const rawBody = await req.text();

  // Extract Facebook signature headers
  const signature256 = req.headers.get('x-hub-signature-256');
  const signature = req.headers.get('x-hub-signature');
  const contentType = req.headers.get('content-type') || 'application/json';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (signature256) headers['x-hub-signature-256'] = signature256;
  if (signature) headers['x-hub-signature'] = signature;

  try {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: rawBody,
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (err) {
    console.error('Error proxying Facebook webhook POST:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
