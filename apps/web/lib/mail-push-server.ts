import { NextResponse } from 'next/server';
import { API_BASE_URL } from './api-base';
import { logsBearer } from './logs-session';

/**
 * Forwards a mail-push call to the API with the httpOnly console session. The browser
 * never holds the console token, and the mail Worker never sees it either: the API hashes
 * it before naming the subscription.
 */
export async function mailPushProxy(
  request: Request,
  action: 'subscribe' | 'unsubscribe' | 'heartbeat' | 'status' | 'test',
  method: 'GET' | 'POST',
): Promise<NextResponse> {
  const token = await logsBearer();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = method === 'POST' ? await request.text() : undefined;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api2/admin/mail/push/${action}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'The API could not be reached' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({ error: upstream.statusText }));
  return NextResponse.json(data, { status: upstream.status });
}
