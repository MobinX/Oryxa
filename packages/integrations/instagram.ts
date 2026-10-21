import { loggedFetch, logGraphSendFailure } from './http-log';
import type { InstagramAccountOption } from './facebook';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * The Instagram login uses the same manual Facebook Login flow as the Page connector — a
 * `scope` list, no configuration ID. The Instagram permissions are requested directly here,
 * while the Facebook channel keeps its own scope list in `facebook.ts`.
 */
const INSTAGRAM_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
];

/**
 * Instagram Login rides the same Facebook Login dialog as a Page: the professional account is
 * reached through the Page it is linked to, and its events are sent with that Page's token.
 *
 * `portfolio` is the caller's explicit answer to the connector's "where are your Pages?" choice,
 * exactly as on the Facebook flow: true adds `business_management`, false deliberately does not.
 * Left undefined, the deployment flag decides.
 */
export function getInstagramOAuthUrl(state: string, portfolio?: boolean): string {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  const scopes = [...INSTAGRAM_SCOPES];
  if (portfolio ?? process.env.META_BUSINESS_MANAGEMENT === 'true') {
    scopes.push('business_management');
  }
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${scopes.join(',')}&state=${encodeURIComponent(state)}`;
}

type LinkedInstagramAccount = {
  id?: string;
  username?: string;
  name?: string;
  profile_pic?: string;
};

/**
 * The Instagram professional account linked to a Page, or null when there is none. This is the
 * only supported shape for Instagram with Facebook Login; an account that is not professional
 * simply has no link here and cannot be messaged through the Graph API.
 */
export async function getInstagramAccountForPage(
  pageId: string,
  pageToken: string,
): Promise<InstagramAccountOption | null> {
  const params = new URLSearchParams({
    fields: 'instagram_business_account{id,username,name,profile_pic}',
    access_token: pageToken,
  });
  const res = await loggedFetch(
    `${GRAPH_API}/${encodeURIComponent(pageId)}?${params}`,
    undefined,
    'instagram',
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    instagram_business_account?: LinkedInstagramAccount;
  } | null;
  const account = body?.instagram_business_account;
  if (!account?.id) return null;
  return {
    id: account.id,
    username: account.username ?? account.name ?? account.id,
    name: account.name,
    profilePic: account.profile_pic,
  };
}

/**
 * Fields a Page must deliver for an Instagram connection. `comments` is the Instagram comment
 * field; `feed` and `messages` stay so connecting Instagram never silently unsubscribes the
 * Page's own Messenger and comment webhooks.
 */
export const INSTAGRAM_PAGE_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'feed',
  'comments',
] as const;

/** Subscribes the Page linked to an Instagram account to DM, postback and comment events. */
export async function subscribeInstagramPageToWebhooks(
  pageId: string,
  pageToken: string,
): Promise<void> {
  const fields = INSTAGRAM_PAGE_WEBHOOK_FIELDS.join(',');
  const url = `${GRAPH_API}/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`;
  const res = await loggedFetch(url, { method: 'POST' }, 'instagram');
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Instagram webhook subscription failed: ${raw}`);
  }
  let data: { success?: boolean } = {};
  try {
    data = JSON.parse(raw) as { success?: boolean };
  } catch {
    // Meta sometimes answers an empty success body.
  }
  if (data.success === false) {
    throw new Error('Instagram webhook subscription failed: success=false');
  }
}

/**
 * The IGSID's profile. Instagram only releases it after the person has messaged the business:
 * the call answers an error for a commenter who never opened the thread, which is why every
 * caller treats this as best-effort and keeps the username from the webhook instead.
 */
export async function getInstagramUserProfile(
  pageToken: string,
  igsid: string,
): Promise<{ name?: string; avatar?: string; username?: string }> {
  try {
    const params = new URLSearchParams({
      fields: 'name,username,profile_pic',
      access_token: pageToken,
    });
    const res = await loggedFetch(
      `${GRAPH_API}/${encodeURIComponent(igsid)}?${params}`,
      undefined,
      'instagram',
    );
    if (!res.ok) return {};
    const body = (await res.json()) as {
      name?: string;
      username?: string;
      profile_pic?: string;
    };
    return {
      name: body.name ?? body.username,
      username: body.username,
      avatar: body.profile_pic,
    };
  } catch {
    return {};
  }
}

/**
 * What the commented-on post actually says. Instagram media carry a caption instead of a
 * message; the permalink and media type are the same context a Page post gives a comment agent.
 */
export async function getInstagramMediaContext(
  pageToken: string,
  mediaId: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      fields: 'caption,media_type,media_url,thumbnail_url,permalink,username,timestamp',
      access_token: pageToken,
    });
    const res = await loggedFetch(
      `${GRAPH_API}/${encodeURIComponent(mediaId)}?${params}`,
      undefined,
      'instagram',
    );
    if (!res.ok) return null;
    const media = (await res.json()) as {
      caption?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      permalink?: string;
      username?: string;
      timestamp?: string;
    };
    const parts: string[] = [];
    if (media.caption) parts.push(`Post caption: ${media.caption}`);
    if (media.media_type) {
      parts.push(`Media: ${media.media_type}${media.username ? ` by @${media.username}` : ''}`);
    }
    const preview = media.thumbnail_url ?? media.media_url;
    if (preview) parts.push(`Media URL: ${preview}`);
    if (media.permalink) parts.push(`Permalink: ${media.permalink}`);
    if (media.timestamp) parts.push(`Posted: ${media.timestamp}`);
    return parts.length ? parts.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Posts a public reply under an Instagram comment and returns the new comment id. Replying to
 * a reply is accepted by Meta and attaches the answer to the top-level comment, which is why
 * the caller does not have to resolve the root itself.
 */
export async function replyToInstagramComment(
  pageToken: string,
  commentId: string,
  text: string,
): Promise<string> {
  // Documented shape is `POST /{ig-comment-id}/replies?message=...`, so the message rides
  // the query string exactly as Meta shows it rather than a JSON body this edge may ignore.
  const params = new URLSearchParams({ message: text, access_token: pageToken });
  const res = await loggedFetch(
    `${GRAPH_API}/${encodeURIComponent(commentId)}/replies?${params.toString()}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
    },
    'instagram',
  );

  if (!res.ok) {
    const err = await res.text();
    logGraphSendFailure(res.status);
    throw new Error(`Instagram reply to comment failed: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}
