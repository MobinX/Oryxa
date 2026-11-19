import { mailPushProxy } from '@/lib/mail-push-server';

export async function GET(request: Request) {
  return mailPushProxy(request, 'status', 'GET');
}
