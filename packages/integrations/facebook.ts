import { PostPublisher, registerPublisher } from './publisher';

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
    'pages_read_user_content', // dependency of pages_manage_engagement; read comments on posts
    'pages_read_engagement',   // receive comment webhooks, post context
    'pages_manage_engagement', // reply to comments
    'pages_manage_posts',
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

/** Webhook fields subscribed when a Facebook Page is connected in Oryxa. */
export const FACEBOOK_PAGE_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'feed', // Page comment webhooks
] as const;

/**
 * Subscribes a Page to this app's webhooks so Meta delivers Messenger DMs,
 * postbacks, and feed (comment) events to `/webhooks/facebook`.
 */
export async function subscribeFacebookPageToWebhooks(
  pageId: string,
  pageToken: string,
): Promise<void> {
  const fields = FACEBOOK_PAGE_WEBHOOK_FIELDS.join(',');
  const url = `${GRAPH_API}/${pageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`;
  console.log('[fb-subscribe] subscribing page', {
    pageId,
    fields,
    graphApiVersion: GRAPH_API,
  });

  const res = await fetch(url, { method: 'POST' });
  const rawBody = await res.text();
  console.log('[fb-subscribe] response', {
    pageId,
    status: res.status,
    ok: res.ok,
    body: rawBody,
  });

  if (!res.ok) {
    throw new Error(`Facebook page webhook subscription failed: ${rawBody}`);
  }
  let data: { success?: boolean } = {};
  try {
    data = JSON.parse(rawBody) as { success?: boolean };
  } catch {
    // Some success responses have an empty body — treat as success.
  }
  if (data.success === false) {
    throw new Error('Facebook page webhook subscription failed: success=false');
  }
  console.log('[fb-subscribe] success', { pageId, success: data.success ?? true });
}

/**
 * Unsubscribes a Page from this app's webhooks. Called when a channel is
 * deleted so Meta stops delivering events for that page.
 */
export async function unsubscribeFacebookPageFromWebhooks(
  pageId: string,
  pageToken: string,
): Promise<void> {
  const url = `${GRAPH_API}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`;
  console.log('[fb-unsubscribe] unsubscribing page', { pageId });

  const res = await fetch(url, { method: 'DELETE' });
  const rawBody = await res.text();
  console.log('[fb-unsubscribe] response', {
    pageId,
    status: res.status,
    ok: res.ok,
    body: rawBody,
  });

  if (!res.ok) {
    throw new Error(`Facebook page webhook unsubscription failed: ${rawBody}`);
  }
  console.log('[fb-unsubscribe] success', { pageId });
}

/** Graph error_subcodes for “sent outside the allowed messaging window”. */
const OUTSIDE_WINDOW_SUBCODES = new Set([2018278, 2534022, 2018065]);

function parseGraphError(body: string): {
  code?: number;
  subcode?: number;
  message?: string;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; error_subcode?: number; message?: string };
    };
    return {
      code: parsed.error?.code,
      subcode: parsed.error?.error_subcode,
      message: parsed.error?.message,
    };
  } catch {
    return {};
  }
}

export class FacebookSendError extends Error {
  readonly name = 'FacebookSendError';
  readonly userMessage: string;
  readonly graphCode?: number;
  readonly graphSubcode?: number;

  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    const parsed = parseGraphError(body);
    super(`Facebook send message failed: ${body}`);
    this.graphCode = parsed.code;
    this.graphSubcode = parsed.subcode;
    this.userMessage = isOutsideWindow(parsed.code, parsed.subcode)
      ? "Facebook only allows a reply within 24 hours of the customer's last message. Ask them to send you a message, then try again."
      : parsed.message || 'Failed to send Facebook message.';
  }

  get isOutsideWindow(): boolean {
    return isOutsideWindow(this.graphCode, this.graphSubcode);
  }
}

export function isFacebookSendError(err: unknown): err is FacebookSendError {
  return (
    err instanceof FacebookSendError ||
    (err instanceof Error && err.name === 'FacebookSendError' && 'userMessage' in err)
  );
}

function isOutsideWindow(code?: number, subcode?: number): boolean {
  return code === 10 && subcode != null && OUTSIDE_WINDOW_SUBCODES.has(subcode);
}

type SendPayload = {
  recipient: { id: string };
  message: { text: string };
  messaging_type: 'RESPONSE' | 'MESSAGE_TAG';
  tag?: 'HUMAN_AGENT';
};

async function postMessengerSend(pageToken: string, payload: SendPayload): Promise<void> {
  const res = await fetch(`${GRAPH_API}/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new FacebookSendError(res.status, await res.text());
  }
}

export type SendMessageOptions = {
  /**
   * Set by the inbox UI send path only. Always uses Meta's HUMAN_AGENT tag.
   * Automated agent replies must omit this — Meta forbids the tag for bots.
   */
  humanAgent?: boolean;
};

export async function senderAction(
  pageToken: string,
  recipientId: string,
  sender_action: 'mark_seen' | 'typing_on' | 'typing_off',
): Promise<void> {
  const isTyping = sender_action === 'typing_on' || sender_action === 'typing_off';
  if (isTyping) console.log(`[typing :] ${sender_action}`, { recipientId });
  try {
    const res = await fetch(`${GRAPH_API}/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action }),
    });
    const body = await res.text();
    if (isTyping) {
      const parsed = parseGraphError(body);
      console.log(`[typing :] ${sender_action} fetch`, {
        recipientId,
        status: res.status,
        ok: res.ok,
        body,
        ...(res.ok ? {} : { code: parsed.code, subcode: parsed.subcode, message: parsed.message }),
      });
    }
  } catch (err) {
    if (isTyping) {
      console.log(`[typing :] ${sender_action} failed`, { recipientId, err: String(err) });
    }
  }
}

export async function sendMessage(
  pageToken: string,
  recipientId: string,
  text: string,
  options?: SendMessageOptions,
): Promise<void> {
  const recipient = { id: recipientId };
  const message = { text };

  if (options?.humanAgent) {
    await postMessengerSend(pageToken, {
      recipient,
      message,
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
    });
    return;
  }

  // TESTING: skip typing_off so the typing bubble stays until Meta clears it.
  // await senderAction(pageToken, recipientId, 'typing_off');
  await postMessengerSend(pageToken, {
    recipient,
    message,
    messaging_type: 'RESPONSE',
  });
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
  const res = await fetch(`${GRAPH_API}/${commentId}/comments?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text }),
    signal: AbortSignal.timeout(20_000),
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

export async function publishFacebookPost(
  pageToken: string,
  pageId: string,
  message: string,
  mediaUrls?: string[],
): Promise<string> {
  const hasMedia = mediaUrls && mediaUrls.length > 0;
  const endpoint = hasMedia
    ? `${GRAPH_API}/${pageId}/photos`
    : `${GRAPH_API}/${pageId}/feed`;

  // Include access_token in the body (not query string) for reliability.
  // The older /feed and /photos endpoints require form-urlencoded, not JSON.
  const params = new URLSearchParams();
  params.append('access_token', pageToken);
  if (hasMedia) {
    params.append('url', mediaUrls[0]);
    params.append('caption', message);
  } else {
    params.append('message', message);
  }

  const tokenPreview = `${pageToken.slice(0, 6)}…${pageToken.slice(-4)}`;
  console.log(`[fb-publish] POST ${endpoint} | tokenPreview=${tokenPreview} | hasMedia=${hasMedia}`);
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      body: params,
    });
  } catch (networkErr: any) {
    console.error(`[fb-publish] Network error after ${Date.now() - t0}ms:`, networkErr?.message, networkErr?.cause);
    throw new Error(`Facebook publish network error: ${networkErr?.message ?? networkErr}`);
  }

  console.log(`[fb-publish] response status=${res.status} in ${Date.now() - t0}ms`);

  if (!res.ok) {
    const err = await res.text();
    console.error(`[fb-publish] HTTP ${res.status} error body:`, err);
    throw new Error(`Facebook publish failed (HTTP ${res.status}): ${err}`);
  }

  const data = (await res.json()) as { id: string; post_id?: string };
  console.log(`[fb-publish] published OK — returned id=${data.id} post_id=${data.post_id}`);
  return data.post_id || data.id;
}

export async function fetchFacebookPostStats(
  pageToken: string,
  postId: string,
): Promise<{ likeCount: number; commentCount: number; shareCount: number; reachCount: number }> {
  const fields = 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares';
  const res = await fetch(`${GRAPH_API}/${postId}?fields=${fields}&access_token=${pageToken}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook fetch post stats failed: ${err}`);
  }

  const data = (await res.json()) as {
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  };

  return {
    likeCount: data.likes?.summary?.total_count ?? 0,
    commentCount: data.comments?.summary?.total_count ?? 0,
    shareCount: data.shares?.count ?? 0,
    reachCount: 0,
  };
}

export const facebookPublisher: PostPublisher = {
  publish: (channel, content, mediaUrls) =>
    publishFacebookPost(channel.apiToken, channel.platformChannelId, content, mediaUrls),
  syncStats: (channel, platformPostId) =>
    fetchFacebookPostStats(channel.apiToken, platformPostId),
};

registerPublisher('facebook', facebookPublisher);


/*
 * Go to the Website.  Press login or Start button
 * Then login with test user credentials.
 * Email: test@test.com
 * Password: 12345678
 *
 * Then you will be taken to business manager where you can create business.  You will find "Test Business" in the list. This is already created for testing purpose. Additionally you can create any business of your wish to see any other functionality. Click on "Open".
 * This will open you a business space where you will find dashboard, products , order , channels etc.
 *
 * Go to products. You will find "Test Product" . You can also create your own product. This product info along with previously added business info give AI context
 * */
