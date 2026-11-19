import { mailPushProxy } from '@/lib/mail-push-server';

export async function POST(request: Request) {
  return mailPushProxy(request, 'subscribe', 'POST');
}
