const GRAPH_API = 'https://graph.facebook.com/v21.0';
const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toHex(sig);
}

/** Constant-time string compare to avoid timing-based signature oracle. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function getFacebookOAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  const scopes = ['pages_messaging', 'pages_show_list', 'pages_manage_metadata'].join(',');
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${scopes}&state=${encodeURIComponent(state)}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    code,
  });

  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Facebook token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getUserPages(userToken: string) {
  const res = await fetch(`${GRAPH_API}/me/accounts?access_token=${userToken}`);
  if (!res.ok) throw new Error(`Failed to fetch pages: ${await res.text()}`);
  const data = (await res.json()) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };
  return data.data;
}

export async function sendMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook send message failed: ${err}`);
  }
}

/**
 * Verifies a Meta webhook signature (HMAC-SHA256 of the raw request body using
 * `META_APP_SECRET`) against the `X-Hub-Signature-256` header. Fails closed if
 * the secret is missing or the signature is absent/invalid.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
): Promise<boolean> {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = await hmacHex(secret, payload);
  return timingSafeEqual(received.toLowerCase(), expected.toLowerCase());
}

/**
 * Creates a signed, short-lived OAuth `state` token binding the flow to the
 * authenticated user and business. Replaces passing the raw businessId, which
 * let anyone complete OAuth against an arbitrary business.
 *
 * Format: `businessId.userId.exp.sig` (UUIDs contain no `.`).
 */
export async function createOAuthState(
  payload: { businessId: string; userId: string },
  ttlSeconds = 600,
): Promise<string> {
  const secret = process.env.INTERNAL_KEY;
  if (!secret) throw new Error('INTERNAL_KEY is required to start Facebook OAuth');
  const exp = Date.now() + ttlSeconds * 1000;
  const body = `${payload.businessId}.${payload.userId}.${exp}`;
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

/** Verifies a `state` returned by Meta; returns the bound ids or null. */
export async function verifyOAuthState(
  state: string | undefined,
): Promise<{ businessId: string; userId: string } | null> {
  const secret = process.env.INTERNAL_KEY;
  if (!secret || !state) return null;
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [businessId, userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!businessId || !userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacHex(secret, `${businessId}.${userId}.${expStr}`);
  if (!timingSafeEqual(sig, expected)) return null;
  return { businessId, userId };
}
