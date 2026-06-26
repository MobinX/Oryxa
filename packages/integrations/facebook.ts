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
  const scopes = [
    'pages_messaging',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_manage_engagement', // reply to comments
    'pages_read_engagement',   // receive comment webhooks
  ].join(',');
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
 * Posts a public reply to a specific Facebook Page comment and returns the
 * platform id of the newly created reply comment (used to persist the bot's
 * `self` comment row with the exact id Meta assigned).
 */
export async function replyToFacebookComment(
  pageToken: string,
  commentId: string,
  text: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${commentId}/replies?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook reply to comment failed: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Best-effort fetch of a user's display name + profile picture from the Graph
 * API. For Messenger the id is a page-scoped id (PSID) and a page token can
 * resolve first/last name + profile_pic. For comment senders the id is a user
 * id and the picture may be a default silhouette depending on privacy settings.
 * Never throws — returns whatever it could resolve (callers treat gaps as
 * "not enriched yet" and retry on the next inbound).
 */
export async function getFacebookUserProfile(
  pageToken: string,
  userId: string,
): Promise<{ name?: string; avatar?: string }> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${userId}?fields=name,first_name,last_name,profile_pic&access_token=${pageToken}`,
    );
    if (!res.ok) return {};
    const d = (await res.json()) as {
      name?: string;
      first_name?: string;
      last_name?: string;
      profile_pic?: string;
    };
    const combined = [d.first_name, d.last_name].filter(Boolean).join(' ');
    const name = d.name ?? combined;
    return { name: name || undefined, avatar: d.profile_pic };
  } catch {
    return {};
  }
}

/**
 * Best-effort fetch of a Page post's caption, primary attachment, and permalink
 * so the comment agent has the context of what the comment is about. Returns
 * null if the post can't be read (deleted, privacy, API hiccup). Never throws.
 */
export async function getFacebookPostContext(
  pageToken: string,
  postId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${postId}?fields=message,attachments{media_type,title,url},permalink_url&access_token=${pageToken}`,
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      message?: string;
      permalink_url?: string;
      attachments?: { data: Array<{ media_type?: string; title?: string; url?: string }> };
    };
    const parts: string[] = [];
    if (d.message) parts.push(`Post caption: ${d.message}`);
    const att = d.attachments?.data?.[0];
    if (att) {
      parts.push(
        `Attachment: ${att.media_type ?? 'unknown'}${att.title ? ` - ${att.title}` : ''}${att.url ? ` (${att.url})` : ''}`,
      );
    }
    if (d.permalink_url) parts.push(`Permalink: ${d.permalink_url}`);
    return parts.length ? parts.join('\n') : null;
  } catch {
    return null;
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

export type FacebookPageOption = {
  id: string;
  name: string;
  access_token: string;
};

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): Uint8Array {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * After OAuth, holds the user's Facebook pages (with page access tokens) in a
 * short-lived signed token so the web app can show a page picker without
 * storing tokens in the session DB. Format: `<base64url(payload)>.<sig>`.
 */
export async function createFacebookPagesSelectionToken(
  payload: { businessId: string; userId: string; pages: FacebookPageOption[] },
  ttlSeconds = 600,
): Promise<string> {
  const secret = process.env.INTERNAL_KEY;
  if (!secret) throw new Error('INTERNAL_KEY is required for Facebook page selection');
  const exp = Date.now() + ttlSeconds * 1000;
  const body = toBase64Url(
    encoder.encode(
      JSON.stringify({
        businessId: payload.businessId,
        userId: payload.userId,
        exp,
        pages: payload.pages,
      }),
    ),
  );
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

/** Verifies a page-selection token from the OAuth callback redirect. */
export async function verifyFacebookPagesSelectionToken(
  token: string | undefined,
): Promise<{ businessId: string; userId: string; pages: FacebookPageOption[] } | null> {
  const secret = process.env.INTERNAL_KEY;
  if (!secret || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as {
      businessId?: string;
      userId?: string;
      exp?: number;
      pages?: FacebookPageOption[];
    };
    if (
      !parsed.businessId ||
      !parsed.userId ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp! < Date.now() ||
      !Array.isArray(parsed.pages) ||
      parsed.pages.length === 0
    ) {
      return null;
    }
    return {
      businessId: parsed.businessId,
      userId: parsed.userId,
      pages: parsed.pages,
    };
  } catch {
    return null;
  }
}
