import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = url.searchParams.toString();
  const upstreamUrl = `${API_URL}/webhooks/instagram${searchParams ? `?${searchParams}` : ''}`;

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
    console.error('Error proxying Instagram webhook GET:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function POST(req: Request) {
  const upstreamUrl = `${API_URL}/webhooks/instagram`;

  // The raw body and Meta's signature headers are forwarded untouched; the API verifies
  // and parses the delivery, and accepts the Instagram object on this path.
  const rawBody = await req.text();

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
    console.error('Error proxying Instagram webhook POST:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
