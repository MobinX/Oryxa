import { logsBearer } from '@/lib/logs-session';

const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';

export async function GET() {
  const bearer = await logsBearer();
  if (!bearer) return Response.json({ error: 'Operator sign-in required' }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api2/admin/export.csv`, {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'The admin export service could not be reached' }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
