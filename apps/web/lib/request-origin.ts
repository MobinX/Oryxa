import { headers } from 'next/headers';

/**
 * The web origin this server action was invoked from. OAuth carries it through its signed state
 * so the merchant returns to the same brand domain instead of the deployment's default.
 */
export async function currentWebOrigin(): Promise<string | undefined> {
  const incoming = await headers();
  const forwardedHost = incoming.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || incoming.get('host')?.trim();
  if (!host) return undefined;
  const forwardedProto = incoming.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto =
    forwardedProto ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}
