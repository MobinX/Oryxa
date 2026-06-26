const enc = new TextEncoder();

/**
 * Computes the `X-Hub-Signature-256` header value Meta would send for a given
 * raw payload, using the test `META_APP_SECRET`. Lets webhook tests exercise
 * the signature-verification gate.
 */
export async function signMetaWebhook(payload: string): Promise<string> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error('META_APP_SECRET must be set for webhook tests');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `sha256=${hex}`;
}

/** Convenience: returns headers + body for a POST to the webhook. */
export async function webhookHeaders(payload: string): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    'x-hub-signature-256': await signMetaWebhook(payload),
  };
}
