import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-base';
import { getConsoleToken } from '@/lib/console-cookie';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ emailId: string; attachmentId: string }> },
) {
  const { emailId, attachmentId } = await params;
  const token = await getConsoleToken();
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_BASE_URL}/api2/admin/mail/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstream.status === 404 ? 'Attachment not found' : 'Attachment fetch failed' },
      { status: upstream.status },
    );
  }
  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'content-length']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new NextResponse(upstream.body, { status: 200, headers });
}
