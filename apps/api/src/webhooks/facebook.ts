import { Hono } from 'hono';
import { getChannelByPageId, getChannelByPlatformAccountId } from '@repo/db/crud/channel';
import {
  processInboundMessage,
  setConversationProfileIfMissing,
  resetStaleConversation,
  checkPendingMessages,
  getOrCreateConversation,
  createMessage,
} from '@repo/db/crud/conversation';
import { getProductById } from '@repo/db/crud/product';
import {
  findBusinessByNotificationToken,
  isMessengerNotificationUser,
  setAgentStateForNotificationUser,
  upsertMessengerNotificationUser,
} from '@repo/db/crud/messenger-notification';
import { processInboundComment, setCommentThreadProfileIfMissing, resetStaleCommentThread, checkPendingComments } from '@repo/db/crud/comment';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { triggerCommentRun } from '@api/lib/comment-runner';
import { readQuota, type QuotaRead, type TriggerOptions, type TriggerVerdict } from '@api/lib/quota';
import { runInBackground } from '@api/lib/background';
import {
  verifyWebhookSignature,
  getFacebookUserProfile,
  fetchMessengerImage,
  fetchMessengerAudio,
  sendMessage as fbSendMessage,
  parseDetailsPayload,
  detailsVariantPayload,
  type DetailsPayload,
} from '@repo/integrations/facebook';
import { getInstagramUserProfile } from '@repo/integrations/instagram';
import { transcribeAudio } from '@repo/integrations/azure-speech';
import { buildMessageImageKey, putImageAtKey } from '@repo/integrations/b2';
import { STALE_RUNNER_MS } from '@api/lib/config';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { tagContext } from '@api/lib/ctx';
import { officialIngest } from '@api/lib/official/ingest';

/** The webhook's own narration, on stdout, next to the event stream. */
function fbLog(message: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`[fb-webhook] ${message}`);
    return;
  }
  console.log(`[fb-webhook] ${message}`, data);
}

type MessagingAttachment = {
  /** `image` for a photo; `sticker`, `audio`, `file`, `fallback` are not. */
  type?: string;
  url?: string;
  payload?: { url?: string; type?: string };
};

type MessagingEvent = {
  sender?: { id?: string };
  message?: {
    text?: string;
    mid?: string;
    is_echo?: boolean;
    attachments?: MessagingAttachment[];
    quick_reply?: { payload?: string };
  };
  postback?: { title?: string; payload?: string; mid?: string };
};

/**
 * Instagram sends both envelopes on the same signed callback URL. The Page object is the
 * Messenger channel; the Instagram object is the professional account linked to that Page.
 */
type MetaWebhookObject = 'page' | 'instagram';
type ChannelPlatform = 'facebook' | 'instagram';

/**
 * The pictures in a message, in the order the customer sent them. Meta gives the same link twice
 * — once on the attachment, once inside its payload — and only one of them has always been
 * populated across API versions, so either will do.
 */
function imageAttachmentUrls(ev: MessagingEvent): string[] {
  return (ev.message?.attachments ?? [])
    .filter((attachment) => attachment.type === 'image')
    .map((attachment) => attachment.payload?.url ?? attachment.url)
    .filter((url): url is string => Boolean(url));
}

/**
 * Copies the customer's pictures into the store's own bucket before Meta's link to them expires.
 * One lost photo never costs the message: a picture that will not download, is not a picture we
 * take, or is bigger than the bucket allows is reported and left out, and the caption still
 * reaches the inbox and the agent.
 */
async function storeInboundPhotos(
  businessId: string,
  urls: string[],
  service: ChannelPlatform = 'facebook',
): Promise<string[]> {
  const keys: string[] = [];

  for (const [index, url] of urls.entries()) {
    try {
      const image = await fetchMessengerImage(url, service);
      if (!image) {
        fbLog('inbound photo could not be fetched', { index });
        emitAnomaly('inbound_photo_lost', { detail: 'fetch' });
        continue;
      }

      const name = fileNameFromUrl(url);
      const key = buildMessageImageKey(businessId, name);
      await putImageAtKey({ key, buffer: image.buffer, contentType: image.contentType });
      keys.push(key);
      fbLog('inbound photo stored', { index, stored: keys.length });
    } catch (err) {
      // putImageAtKey rejects on a type or size the bucket will not hold — the common case being
      // a camera-original the customer sent untouched.
      fbLog('inbound photo could not be stored', { index, err });
      emitAnomaly('inbound_photo_lost', { detail: err instanceof Error ? err.message : 'store' });
    }
  }

  return keys;
}

/** The CDN path's last segment, which is already `…_n.jpg` on a Messenger photo. */
function fileNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'photo.jpg';
  } catch {
    return 'photo.jpg';
  }
}

/**
 * A postback payload is kept verbatim when it reads as a sentence, because our buttons now
 * write the whole request into it — "place order with <id> and <name>", "please track order
 * with id <id>" — which is what turns a tap into something the agent can act on and remember.
 * A payload that is a single opaque token ("GET_STARTED") carries no meaning without the label
 * the buyer actually saw, so there the title is the message.
 */
function postbackMessage(postback: NonNullable<MessagingEvent['postback']>): string | undefined {
  const payload = postback.payload?.trim();
  return payload?.includes(' ') ? payload : (postback.title ?? payload);
}

/** Meta labels a voice note `audio`; the URL is pre-signed and short-lived. */
function audioAttachmentUrl(ev: MessagingEvent): string | null {
  const attachment = ev.message?.attachments?.find((candidate) => candidate.type === 'audio');
  return attachment?.payload?.url ?? attachment?.url ?? null;
}

/** What the Instagram log lane needs to explain a voice note without keeping its audio. */
type AudioTrace = {
  fetched: boolean;
  contentType?: string;
  bytes?: number;
  transcriptChars: number;
  ok: boolean;
  durationMs: number;
  reason?: string;
};

/** The event shape in one word, for the `dm_event` log line. */
function messagingEventType(ev: MessagingEvent): string {
  if (ev.message?.is_echo) return 'echo';
  if (ev.postback) return 'postback';
  if (ev.message?.quick_reply) return 'quick_reply';
  if (audioAttachmentUrl(ev)) return 'audio';
  const images = imageAttachmentUrls(ev);
  if (images.length > 0) return ev.message?.text ? 'image+text' : 'image';
  if (ev.message?.text) return 'text';
  const attachments = ev.message?.attachments ?? [];
  if (attachments.length > 0) {
    const kinds = [...new Set(attachments.map((attachment) => attachment.type ?? 'unknown'))]
      .slice(0, 3)
      .join(',');
    return `attachment:${kinds}`;
  }
  if (ev.message) return 'empty';
  return 'other';
}

async function inboundFromMessagingEvent(
  ev: MessagingEvent,
  platform: ChannelPlatform,
): Promise<{
  senderId: string;
  text: string;
  images: string[];
  externalId?: string;
  audio?: AudioTrace;
} | null> {
  if (ev.message?.is_echo) return null;
  const senderId = ev.sender?.id;
  if (!senderId) return null;

  if (ev.message) {
    const images = imageAttachmentUrls(ev);
    // A photo with no caption is still the whole question — "is this one in your size?" arrives
    // as one image and no words, and dropping it is dropping a customer. A quick-reply tap
    // carries the untruncated option in `payload`; prefer it over the 20-character title.
    if (ev.message.text || images.length > 0) {
      const text = ev.message.quick_reply?.payload?.trim() || ev.message.text || '';
      return { senderId, text, images, externalId: ev.message.mid };
    }
    // A voice note becomes the customer's words before the agent ever sees the turn. A note
    // that cannot be read is still answered — the model is told what arrived, not shown silence.
    const audioUrl = audioAttachmentUrl(ev);
    if (audioUrl) {
      const started = performance.now();
      const audio = await fetchMessengerAudio(audioUrl, platform);
      let transcript: string | null = null;
      let reason: string | undefined = audio ? undefined : 'audio could not be fetched';
      if (audio) {
        try {
          transcript = await transcribeAudio(audio.buffer, audio.contentType);
        } catch (err) {
          reason = err instanceof Error ? err.message : 'transcription failed';
        }
        if (!transcript?.trim() && !reason) reason = 'transcription returned no text';
      }
      const trimmed = transcript?.trim() ?? '';
      const text = trimmed
        ? trimmed
        : '[the customer sent a voice message that could not be transcribed]';
      return {
        senderId,
        text,
        images: [],
        externalId: ev.message.mid,
        audio: {
          fetched: Boolean(audio),
          contentType: audio?.contentType,
          bytes: audio?.buffer.byteLength,
          transcriptChars: trimmed.length,
          ok: Boolean(trimmed),
          durationMs: Math.round((performance.now() - started) * 10) / 10,
          reason,
        },
      };
    }
  }

  const postback = ev.postback;
  if (postback) {
    // A tap with neither payload nor title is still a tap: it must not vanish silently.
    const text = postbackMessage(postback);
    if (!text) return null;
    return { senderId, text, images: [], externalId: postback.mid };
  }

  return null;
}

type CommentChangeValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  /** Meta sends a string post/comment id, not `{ id }`. */
  parent_id?: string | { id?: string };
  message?: string;
  from?: { id?: string; name?: string };
  post_id?: string;
};

function facebookParentCommentId(
  parentId: CommentChangeValue['parent_id'],
  postId: string | undefined,
): string | undefined {
  if (!parentId) return undefined;
  const raw = typeof parentId === 'string' ? parentId : parentId.id;
  if (!raw) return undefined;
  // Top-level comments have parent_id === post_id; that is not a parent comment.
  if (postId && raw === postId) return undefined;
  return raw;
}

type WebhookChange = {
  field?: string;
  value?: CommentChangeValue;
};

type WebhookEntry = {
  id: string;
  messaging?: MessagingEvent[];
  changes?: WebhookChange[];
};

type WebhookBody = {
  object: string;
  entry?: WebhookEntry[];
};

/** Instagram comments arrive as `changes` with the comment itself inside `value`. */
type InstagramCommentValue = {
  comment_id?: string;
  parent_id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
};

/**
 * A lock untouched since this instant is orphaned rather than slow: the process
 * that took it is gone, and nothing will ever release it. Passing the instant to
 * the reset keeps that judgement inside the statement that acts on it, so a
 * recovery can never hand a live run's conversation to a second runner.
 */
function staleBefore(): Date {
  return new Date(Date.now() - STALE_RUNNER_MS);
}

/** How long the state the inbound write found had already been sitting. */
function stateAgeMs(stateAt: Date): number {
  return Date.now() - stateAt.getTime();
}

/**
 * The budget, read at most once per delivery and only if some event in it is about to
 * start a run. A delivery that ends as `no_agent`, a duplicate, or an unsupported payload
 * never pays for the query.
 */
function forTrigger(businessId: string): () => Promise<TriggerOptions> {
  let read: Promise<QuotaRead> | undefined;
  return async () => {
    read ??= readQuota(businessId);
    return { businessId, quota: await read };
  };
}

/** A trigger that was refused for want of budget is a different fact from the one it tried. */
function outcomeOf(verdict: TriggerVerdict, otherwise: string): string {
  return verdict === 'blocked' ? 'quota_exhausted' : otherwise;
}

async function handleTestingForward(c: any, method: 'GET' | 'POST'): Promise<Response | null> {
  if (process.env.TESTING !== 'true' || process.env.NODE_ENV === 'production') {
    fbLog('[TESTING] Testing mode not enabled');
    return null;
  }

  const targetUrl = 'https://api.oryxa.us/webhooks/facebook';
  const queryStr = c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : '';
  const forwardUrl = `${targetUrl}${queryStr}`;

  // The forwarded query carries hub.verify_token, so the URL is never logged.
  emit('webhook', { event: 'testing_forward' });
  fbLog(`[TESTING] Forwarding webhook ${method} request to: ${targetUrl}`);

  if (method === 'GET') {
    try {
      const res = await fetch(forwardUrl);
      const text = await res.text();
      return c.text(text, res.status as any);
    } catch (err) {
      console.error('[TESTING] Failed to forward GET verification:', err);
      emit('error', errorFields(err), { dedupe: null });
      return c.text('Error forwarding', 500);
    }
  }

  // POST request: read text and forward only the headers Meta's receiver needs. Copying every
  // header would hand the upstream host our cookies or authorization if one were ever added.
  const rawBody = await c.req.text();
  const headers: Record<string, string> = {};
  for (const name of ['content-type', 'x-hub-signature-256']) {
    const value = c.req.header(name);
    if (value !== undefined) headers[name] = value;
  }

  fetch(forwardUrl, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch((err) => {
    console.error('[TESTING] Failed to forward POST webhook in background:', err);
    emit('error', errorFields(err), { dedupe: null });
  });

  fbLog('[TESTING] Forwarded POST asynchronously (fire and forget) — acknowledging 200 OK');
  return c.text('EVENT_RECEIVED', 200);
}

export const fbWebhookRouter = new Hono();

/**
 * The verification handshake is identical for both Meta objects: the same verify token,
 * the same challenge. Each app-level webhook entry (Page, Instagram) has to complete it.
 */
async function verifyMetaWebhook(c: any): Promise<Response> {
  const forwardRes = await handleTestingForward(c, 'GET');
  if (forwardRes) return forwardRes;

  const url = new URL(c.req.url);
  const mode = c.req.query('hub.mode') ?? url.searchParams.get('hub.mode');
  const token = c.req.query('hub.verify_token') ?? url.searchParams.get('hub.verify_token');
  const challenge = c.req.query('hub.challenge') ?? url.searchParams.get('hub.challenge');
  const verified = mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN;
  const path = c.req.path;

  // One fact: whether this subscription handshake succeeded. The rejected case is
  // how a page silently stops delivering events — no error, no customer replies.
  emit('webhook', { event: 'verify', mode, verified, hasChallenge: Boolean(challenge) });

  fbLog(`GET ${path}`, {
    url: c.req.url.split('?')[0],
    mode,
    verifyTokenMatch: verified,
    hasChallenge: Boolean(challenge),
    challengeLength: challenge?.length ?? 0,
  });

  if (verified) {
    fbLog(`GET ${path} verify OK — returning challenge`);
    return c.text(challenge ?? '');
  }

  fbLog(`GET ${path} verify rejected`, { mode, verifyTokenMatch: false });
  return c.text('Forbidden', 403);
}

fbWebhookRouter.get('/facebook', verifyMetaWebhook);
fbWebhookRouter.get('/instagram', verifyMetaWebhook);

/**
 * The one event a delivery produces. Customer text, raw bodies and signature
 * values never enter it — Meta signs the raw bytes, so the body is read as text
 * only to verify and parse, then dropped.
 */
function deliveryEventFields(body: WebhookBody, signatureValid: boolean) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  return {
    event: 'delivery',
    object: body.object,
    signatureValid,
    pageId: entries[0]?.id,
    entryCount: entries.length,
    messagingCount: entries.reduce((n, e) => n + (e.messaging?.length ?? 0), 0),
    changesCount: entries.reduce((n, e) => n + (e.changes?.length ?? 0), 0),
  };
}

async function receiveMetaWebhook(c: any): Promise<Response> {
  const forwardRes = await handleTestingForward(c, 'POST');
  if (forwardRes) return forwardRes;

  const path = c.req.path;
  const instagramPath = path.includes('/instagram');
  const signature256 = c.req.header('x-hub-signature-256');
  const signature = c.req.header('x-hub-signature');
  const mode = process.env.META_WEBHOOK_SIGNATURE_MODE ?? 'enforce';
  const logOnlyRequested = mode === 'log-only';
  const isLogOnly = logOnlyRequested && process.env.NODE_ENV !== 'production';
  if (logOnlyRequested && !isLogOnly) {
    fbLog(`POST ${path} signature mode log-only is refused in production — enforcing`);
    emit('webhook', { event: 'signature_mode_ignored', mode });
  }

  // Log request metadata without exposing secrets
  fbLog(`POST ${path} received`, {
    signatureLen: (signature256 ?? signature)?.length ?? 0,
    contentType: c.req.header('content-type') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });

  const raw = await c.req.text();

  const signatureValid = await verifyWebhookSignature(raw, signature256 ?? signature);

  // Enforce signature validation unless in log-only mode
  if (!signatureValid && !isLogOnly) {
    fbLog(`POST ${path} rejected — invalid signature`, { mode, hasSignature: Boolean(signature256 || signature) });
    return c.text('Forbidden', 403);
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch (err) {
    fbLog(`POST ${path} rejected — malformed JSON`);
    emit('webhook', { event: 'delivery', signatureValid });
    if (instagramPath) {
      emit('instagram', {
        stage: 'delivery',
        sourcePath: path,
        signatureValid,
        outcome: 'malformed_json',
      });
    }
    return c.text('Malformed JSON', 400);
  }

  // The same callback URL serves the Page object (Messenger) and the Instagram object
  // (DMs and comments). An app can be configured with one webhook entry per object, and
  // both point here; rejecting either would silently mute one channel.
  if ((body.object !== 'page' && body.object !== 'instagram') || !Array.isArray(body.entry)) {
    fbLog(`POST ${path} rejected — unhandled shape`, {
      object: body.object,
      entryIsArray: Array.isArray(body.entry),
    });
    emit('webhook', deliveryEventFields(body, signatureValid));
    if (body.object === 'instagram' || instagramPath) {
      emit('instagram', {
        stage: 'delivery',
        sourcePath: path,
        signatureValid,
        outcome: 'unhandled_shape',
      });
    }
    return c.text('Unhandled or malformed webhook', 400);
  }

  // An invalid signature is recorded and still accepted: anyone holding this URL
  // can POST a forged page event. Enforcement waits until the failure rate on
  // real Meta traffic has been measured, so a config mistake cannot drop events.
  emit('webhook', deliveryEventFields(body, signatureValid));
  if (body.object === 'instagram') {
    emit('instagram', {
      stage: 'delivery',
      sourcePath: path,
      signatureValid,
      entryCount: body.entry.length,
      messagingCount: body.entry.reduce((n, e) => n + (e.messaging?.length ?? 0), 0),
      changesCount: body.entry.reduce((n, e) => n + (e.changes?.length ?? 0), 0),
    });
  }

  fbLog(`POST ${path} ack — processing entries`, {
    object: body.object,
    entryCount: body.entry.length,
    pageIds: body.entry.map((e) => e.id),
    vercelInline: Boolean(process.env.VERCEL),
  });

  const work = processEntries(body.entry, body.object as MetaWebhookObject).catch((err) => {
    console.error('[fb-webhook] background processing failed', err);
  });

  // Hono's Vercel adapter does not provide executionCtx.waitUntil, so background
  // work was being killed as soon as the 200 ack returned. On Vercel, process
  // inline (Meta allows ~20s). Elsewhere, ack fast and finish in background.
  if (process.env.VERCEL) {
    await work.catch((err) => emit('error', errorFields(err), { dedupe: null }));
  } else {
    runInBackground(c, work, 'fb-webhook');
  }

  return c.text('EVENT_RECEIVED', 200);
}

fbWebhookRouter.post('/facebook', receiveMetaWebhook);
fbWebhookRouter.post('/instagram', receiveMetaWebhook);

/**
 * The operator page's DMs are not store conversations. A message containing a business's
 * notification code binds this Messenger account to that business and is answered once
 * with a connection confirmation. Once bound, ON and OFF flip that business's agent switch
 * and confirm whether the agent is running or stopped. Other messages from a connected
 * notification account are ignored, so a merchant never gets an AI answer from the operator
 * page. Anything else from an unknown sender is ordinary admin-page traffic and falls
 * through. No agent ever runs on an admin-only page.
 */
const NOTIFICATION_CODE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Customer DMs on an admin-only page skip the store flow entirely and hand their turns to
 * the Officials pipeline. Notification codes stay with the flow above — they are a
 * redemption handshake, not a conversation, so they never enter an official thread (the
 * pipeline's external-id dedupe would store them once as junk prose). Echoes, receipts and
 * unsupported content are dropped exactly as the store flow drops them.
 */
async function processOfficialMessaging(
  channel: {
    id: string;
    apiToken: string;
    platform: ChannelPlatform;
    platformChannelId: string;
  },
  events: MessagingEvent[],
): Promise<void> {
  const officialCtx = {
    id: channel.id,
    apiToken: channel.apiToken,
    platform: channel.platform,
    platformChannelId: channel.platformChannelId,
  };
  for (const ev of events) {
    const text = ev.message?.text?.trim() ?? '';
    if (text && NOTIFICATION_CODE.test(text.toLowerCase())) continue;
    const inbound = await inboundFromMessagingEvent(ev, channel.platform);
    if (!inbound || !inbound.text) continue;
    if (inbound.images.length > 0) {
      fbLog('official skip — image-only turn has no transcript', { senderId: inbound.senderId });
      continue;
    }
    fbLog('official ingest dispatch', { senderId: inbound.senderId, textLen: inbound.text.length });
    const verdict = await officialIngest(officialCtx, {
      senderId: inbound.senderId,
      text: inbound.text,
      externalId: inbound.externalId ?? null,
    });
    fbLog('official ingest verdict', { senderId: inbound.senderId, ...verdict });
  }
}

async function processAdminPageCommands(
  channel: { id: string; apiToken: string },
  events: MessagingEvent[],
): Promise<Set<number>> {
  const handled = new Set<number>();
  for (const [index, ev] of events.entries()) {
    const senderId = ev.sender?.id;
    const text = ev.message?.text?.trim().toLowerCase();
    if (!senderId || ev.message?.is_echo || !text) continue;

    // A code can arrive inside a sentence ("my code is …") or with punctuation around it;
    // extracting it keeps the handshake silent instead of letting the Official agent answer.
    const code = text.match(NOTIFICATION_CODE)?.[0];
    if (code) {
      handled.add(index);
      const row = await findBusinessByNotificationToken(code);
      if (!row) {
        fbLog('admin channel: unknown notification code', { senderId });
        continue;
      }

      const profile = await getFacebookUserProfile(channel.apiToken, senderId);
      await upsertMessengerNotificationUser({
        businessId: row.businessId,
        channelId: channel.id,
        platformUserId: senderId,
        name: profile.name ?? null,
      });

      // One confirmation on a successful connection; ON/OFF and other messages remain
      // silent. The merchant needs proof the code was accepted, not a chat.
      const businessName = row.business?.name ?? 'this business';
      await fbSendMessage(
        channel.apiToken,
        senderId,
        `Successfully connected to "${businessName}" and working.`,
      ).catch((err) => console.error('[fb-webhook] notification confirmation failed:', err));

      fbLog('admin channel: messenger user connected', {
        businessId: row.businessId,
        senderId,
      });
      continue;
    }

    // ON/OFF from an account that redeemed a code here flips the business agent.
    const command = text.replace(/[.!]+$/g, '');
    if (command === 'on' || command === 'off') {
      const businessIds = await setAgentStateForNotificationUser(
        channel.id,
        senderId,
        command === 'on',
      );
      if (businessIds.length > 0) {
        handled.add(index);
        fbLog('admin channel: notification user toggled the agent', {
          senderId,
          agentState: command === 'on',
          businessIds,
        });
        await fbSendMessage(
          channel.apiToken,
          senderId,
          command === 'on'
            ? 'Agent is running for all your channels.'
            : 'Agent is stopped for all your channels.',
        ).catch((err) => console.error('[fb-webhook] agent command confirmation failed:', err));
        continue;
      }
    }

    // Once an account is connected for notices, the operator page is a control channel,
    // not a support inbox. Keep its messages away from the Official agent entirely.
    if (await isMessengerNotificationUser(channel.id, senderId)) {
      handled.add(index);
      fbLog('admin channel: ignoring message from a connected notification account', { senderId });
      continue;
    }

    fbLog('admin channel: message is not a notification command or code', { senderId });
  }
  return handled;
}

/**
 * Processes every entry in a batched webhook payload. A single page can deliver
 * either Messenger `messaging` events (DMs) or `changes` events (page feed,
 * including comments) — both are handled here, with the channel looked up once
 * per page.
 */
async function processEntries(
  entries: WebhookEntry[],
  object: MetaWebhookObject,
): Promise<void> {
  fbLog('processEntries start', { object, entryCount: entries.length });
  const platform: ChannelPlatform = object === 'instagram' ? 'instagram' : 'facebook';

  for (const entry of entries) {
    const messaging = entry.messaging ?? [];
    const changes = entry.changes ?? [];

    fbLog('processEntries entry', {
      object,
      accountId: entry.id,
      messagingCount: messaging.length,
      changesCount: changes.length,
    });

    if (messaging.length === 0 && changes.length === 0) {
      fbLog('processEntries skip entry — no messaging or changes', { accountId: entry.id });
      continue;
    }

    const channel =
      platform === 'instagram'
        ? await getChannelByPlatformAccountId('instagram', entry.id)
        : await getChannelByPageId(entry.id);
    if (!channel) {
      // Every event for this account is dropped behind a 200 ack: a disconnected
      // channel is indistinguishable from a quiet one until this says so.
      fbLog('processEntries skip entry — unknown account (no channel)', {
        platform,
        accountId: entry.id,
      });
      emitAnomaly('webhook_unknown_page', { detail: entry.id });
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'entry_dropped',
          accountId: entry.id,
          messagingCount: messaging.length,
          changesCount: changes.length,
          resolved: false,
          outcome: 'unknown_account',
        });
      }
      continue;
    }

    // Stamped early enough that the entry row itself names the store and channel.
    tagContext({
      channelId: channel.id,
      ...(channel.businessId ? { businessId: channel.businessId } : {}),
    });

    if (platform === 'instagram') {
      emit('instagram', {
        stage: 'entry',
        accountId: entry.id,
        messagingCount: messaging.length,
        changesCount: changes.length,
        resolved: true,
      });
    }

    fbLog('processEntries channel resolved', {
      platform,
      accountId: entry.id,
      channelId: channel.id,
      businessId: channel.businessId,
      agentId: channel.agentId ?? null,
    });

    // The operator's page is a notification door and an official-inbox door: DMs carry
    // notification codes and, beyond those, customer traffic for the Officials pipeline.
    // No conversation with a store, no agent, no quota — this intercept is the whole handling.
    if (channel.isAdminOnly) {
      fbLog('processEntries admin-only channel — notification codes + official inbox', {
        pageId: entry.id,
        messagingCount: messaging.length,
      });
      if (messaging.length > 0) {
        const handled = await processAdminPageCommands(
          { id: channel.id, apiToken: channel.apiToken },
          messaging,
        );
        const remaining = messaging.filter((_, index) => !handled.has(index));
        await processOfficialMessaging(
          { id: channel.id, apiToken: channel.apiToken, platform, platformChannelId: entry.id },
          remaining,
        );
      }
      continue;
    }

    const businessId = channel.businessId;
    if (!businessId) {
      fbLog('processEntries skip entry — channel has no business', { pageId: entry.id });
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'entry_dropped',
          accountId: entry.id,
          messagingCount: messaging.length,
          changesCount: changes.length,
          resolved: true,
          outcome: 'no_business',
        });
      }
      continue;
    }

    // Stamped onto every later event of this invocation instead of repeated on
    // each one; deliveries carry a single page in practice.
    tagContext({ channelId: channel.id, businessId });

    // The business-wide switch: messages and comments are still stored for the inbox,
    // but no run is scheduled and no automated reply leaves the page.
    const agentOn = channel.business?.agentState !== false;

    if (messaging.length > 0) {
      await processMessagingEvents({ ...channel, businessId }, messaging, platform, agentOn);
    }
    if (changes.length > 0) {
      if (platform === 'instagram') {
        await processInstagramChanges({ ...channel, businessId }, entry.id, changes, agentOn);
      } else {
        await processCommentChanges({ ...channel, businessId }, entry.id, changes, agentOn);
      }
    }
  }

  fbLog('processEntries done');
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Card titles are one line and roughly 30 visible characters — collapse before Meta does it badly. */
function cardLine(value: string, max = 60): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * A Details tap is answered here, not by the model: variant cards for a product, or every photo
 * of one variant. Each answer is recorded as a `self` message so the next real turn knows what
 * the customer has already been shown. When nothing can be sent, the caller hands the reason to
 * the agent so it can apologize and suggest something else.
 */
type DetailsOutcome = { handled: true } | { handled: false; reason: string };

async function handleDetailsPostback(
  channel: { id: string; businessId: string; apiToken: string },
  senderId: string,
  details: DetailsPayload,
  platform: ChannelPlatform,
): Promise<DetailsOutcome> {
  try {
    const product = await getProductById(channel.businessId, details.productId);
    if (!product) {
      return { handled: false, reason: "the product is no longer in this store's catalog" };
    }
    const conversation = await getOrCreateConversation(channel.businessId, channel.id, senderId);

    if (details.kind === 'product') {
      const cards = product.variants
        .filter((variant) => Boolean(variant.imageUrl))
        .slice(0, 10)
        .map((variant) => {
          const label = cardLine(`${product.name} — ${variant.name}`);
          const price = variant.price ?? product.price;
          const buyable = variant.isAvailable && variant.stock > 0;
          const detailsButton = {
            title: 'Details',
            payload: detailsVariantPayload(product.id, variant.id),
          };
          return {
            title: label,
            subtitle: `${usd.format(price)} — ${variant.stock} in stock${variant.variantId ? ` — ${variant.variantId}` : ''}`,
            imageUrl: variant.imageUrl as string,
            ...(buyable
              ? {
                  button: {
                    title: 'Order',
                    payload: `place order with ${product.id} and ${label} variant ${variant.id}`,
                  },
                  extraButtons: [detailsButton],
                }
              : { button: detailsButton }),
          };
        });
      if (cards.length === 0) {
        return { handled: false, reason: `no variant of "${product.name}" has a photo to show` };
      }

      await fbSendMessage(channel.apiToken, senderId, cards, { platform });

      const stockTotal = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
      const optionsText = (product.options ?? [])
        .map((option) => `${option.name}: ${option.values.map((value) => value.value).join(', ')}`)
        .join('; ');
      const variantText = product.variants
        .map(
          (variant) =>
            `${variant.name}${variant.variantId ? ` (${variant.variantId})` : ''} — ${usd.format(variant.price ?? product.price)}, ${variant.stock} in stock`,
        )
        .join('; ');
      await createMessage({
        conversationId: conversation.id,
        from: 'self',
        sentBy: 'ai',
        content: [
          `Showing product details of ${product.id}, ${product.name}`,
          `${usd.format(product.price)}, SKU ${product.sku}${product.category ? `, category ${product.category.name}` : ''}, ${stockTotal} in stock across ${product.variants.length} variants`,
          `variants: ${variantText}`,
          ...(optionsText ? [`options: ${optionsText}`] : []),
        ].join(' — '),
        state: 'done',
      });
      return { handled: true };
    }

    const variant = product.variants.find((candidate) => candidate.id === details.variantId);
    if (!variant) {
      return { handled: false, reason: `that variant is no longer part of "${product.name}"` };
    }
    const images = (
      variant.imageUrls?.length ? variant.imageUrls : variant.imageUrl ? [variant.imageUrl] : []
    ).slice(0, 10);
    if (images.length === 0) {
      return { handled: false, reason: `the variant "${variant.name}" has no photos to show` };
    }

    const label = cardLine(`${product.name} — ${variant.name}`);
    const price = variant.price ?? product.price;
    const buyable = variant.isAvailable && variant.stock > 0;
    const cards = images.map((imageUrl, index) => ({
      title: label,
      subtitle: `${usd.format(price)} — ${variant.stock} in stock${images.length > 1 ? ` — photo ${index + 1} of ${images.length}` : ''}${variant.variantId ? ` — ${variant.variantId}` : ''}`,
      imageUrl,
      ...(buyable
        ? {
            button: {
              title: 'Order',
              payload: `place order with ${product.id} and ${label} variant ${variant.id}`,
            },
          }
        : {
            button: {
              title: 'Details',
              payload: detailsVariantPayload(product.id, variant.id),
            },
          }),
    }));

    await fbSendMessage(channel.apiToken, senderId, cards, { platform });
    await createMessage({
      conversationId: conversation.id,
      from: 'self',
      sentBy: 'ai',
      content: `Showing all variant images of ${product.id} with variant of ${variant.variantId ?? variant.name} (${variant.name}) — ${variant.stock} in stock, unit price ${usd.format(price)}, total price ${usd.format(price * variant.stock)} (${images.length} images).`,
      state: 'done',
    });
    return { handled: true };
  } catch (err) {
    console.error('[fb-webhook] details postback failed', err);
    return { handled: false, reason: 'the catalog could not be read right now' };
  }
}

/** Messenger DM events: dedup on mid, skip echoes + non-text/postback, trigger agent, enrich profile. */
async function processMessagingEvents(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  events: MessagingEvent[],
  platform: ChannelPlatform,
  agentOn = true,
): Promise<void> {
  fbLog('processMessagingEvents start', {
    channelId: channel.id,
    platform,
    eventCount: events.length,
  });
  const budget = forTrigger(channel.businessId);

  for (const [index, ev] of events.entries()) {
    fbLog('processMessagingEvents event', { index, hasPayload: Boolean(ev.message) || Boolean(ev.postback) });

    if (platform === 'instagram') {
      emit('instagram', {
        stage: 'dm_event',
        eventType: messagingEventType(ev),
        senderId: ev.sender?.id,
        externalId: ev.message?.mid ?? ev.postback?.mid,
        text: ev.message?.text,
        imageCount: imageAttachmentUrls(ev).length,
        hasAudio: Boolean(audioAttachmentUrl(ev)),
        quickReply: ev.message?.quick_reply?.payload,
        postbackTitle: ev.postback?.title,
      });
    }

    // Details buttons are answered deterministically: cards go back from here, the model never
    // runs, and the exchange is recorded as a self message for the next real turn to read. If the
    // details cannot be produced, the tap becomes an ordinary customer turn that carries the
    // failure — so the agent can apologize and suggest something else instead of staying silent.
    const details = ev.postback ? parseDetailsPayload(ev.postback.payload) : null;
    if (details && ev.sender?.id) {
      if (!agentOn) {
        fbLog('processMessagingEvents details postback skipped — business agent off', {
          index,
          kind: details.kind,
        });
        continue;
      }
      const result = await handleDetailsPostback(channel, ev.sender.id, details, platform);
      fbLog('processMessagingEvents details postback', {
        index,
        kind: details.kind,
        handled: result.handled,
        ...(result.handled ? {} : { reason: result.reason }),
      });
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'details',
          detailsKind: details.kind,
          productId: details.productId,
          variantId: details.kind === 'variant' ? details.variantId : undefined,
          senderId: ev.sender.id,
          externalId: ev.postback?.mid,
          handled: result.handled,
          reason: result.handled ? undefined : result.reason,
          outcome: result.handled ? 'details_handled' : 'details_unhandled',
        });
      }
      if (result.handled) continue;

      if (!channel.agentId) {
        emit('webhook_item', {
          kind: 'message',
          senderId: ev.sender.id,
          outcome: 'details_unhandled',
        });
        continue;
      }

      const conversation = await getOrCreateConversation(
        channel.businessId,
        channel.id,
        ev.sender.id,
      );
      const asked =
        details.kind === 'product'
          ? `I tapped "Details" to see all the variants of product ${details.productId}, but they could not be shown: ${result.reason}.`
          : `I tapped "Details" to see all the photos of one variant (${details.variantId}) of product ${details.productId}, but they could not be shown: ${result.reason}.`;
      await createMessage({
        conversationId: conversation.id,
        from: 'customer',
        content: `${asked} Tell me briefly what went wrong and suggest another product from the store.`,
      });
      const verdict = await triggerAgentRun(conversation.id, await budget());
      const fallbackOutcome = outcomeOf(verdict, 'details_fallback');
      fbLog('processMessagingEvents details fallback run', {
        index,
        outcome: fallbackOutcome,
      });
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'trigger',
          senderId: ev.sender.id,
          externalId: ev.postback?.mid,
          inserted: true,
          outcome: fallbackOutcome,
        });
      }
      continue;
    }

    const inbound = await inboundFromMessagingEvent(ev, platform);
    if (!inbound) {
      // An echo or a read receipt is not a customer, so it stays silent. A real
      // message with neither text nor a picture (sticker, audio, file) is a customer who
      // will not be answered, and that is the only skipped case worth an event.
      fbLog('processMessagingEvents skip event — not actionable text/postback', {
        index,
        isEcho: ev.message?.is_echo ?? false,
        hasText: Boolean(ev.message?.text),
        hasPostback: Boolean(ev.postback),
        postbackPayload: ev.postback?.payload ?? null,
        attachmentCount: ev.message?.attachments?.length ?? 0,
        senderId: ev.sender?.id ?? null,
      });
      if (ev.message && !ev.message.is_echo && !ev.message.text && imageAttachmentUrls(ev).length === 0) {
        emit('webhook_item', {
          kind: 'message',
          externalId: ev.message.mid,
          senderId: ev.sender?.id,
          outcome: 'unsupported_content',
        });
      }
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'dm_result',
          eventType: messagingEventType(ev),
          senderId: ev.sender?.id,
          externalId: ev.message?.mid ?? ev.postback?.mid,
          outcome: ev.message?.is_echo
            ? 'echo'
            : ev.sender?.id
              ? 'unsupported_content'
              : 'incomplete_payload',
        });
      }
      continue;
    }

    const { senderId, text, images, externalId, audio } = inbound;
    fbLog('processMessagingEvents inbound', {
      index,
      senderId,
      textLen: text.length,
      externalId: externalId ?? null,
      photoCount: images.length,
    });

    if (platform === 'instagram' && audio) {
      emit('instagram', {
        stage: 'audio',
        senderId,
        externalId,
        fetched: audio.fetched,
        contentType: audio.contentType,
        bytes: audio.bytes,
        transcriptChars: audio.transcriptChars,
        durationMs: audio.durationMs,
        ok: audio.ok,
        reason: audio.reason,
        outcome: audio.ok ? undefined : 'transcription_failed',
      });
    }

    // Copied before the row is written, so the message never exists without the pictures it
    // was sent with — and never gets a second copy of them when Meta delivers it twice.
    const imageKeys =
      images.length > 0 ? await storeInboundPhotos(channel.businessId, images, platform) : [];

    if (platform === 'instagram' && images.length > 0) {
      emit('instagram', {
        stage: 'images',
        senderId,
        externalId,
        count: images.length,
        stored: imageKeys.length,
        failed: images.length - imageKeys.length,
        outcome: imageKeys.length === images.length ? undefined : 'image_copy_failed',
      });
    }

    // A photo that arrived with no caption and did not survive the copy would otherwise be an
    // empty row: nothing for the merchant to read and nothing for the agent to answer. Saying
    // what happened is the one thing that is true of it.
    const content =
      text || (images.length > 0 && imageKeys.length === 0
        ? '[a photo the customer sent could not be received]'
        : '');
    const messageKind = ev.message?.quick_reply
      ? 'quick_reply'
      : ev.postback
        ? 'postback'
        : undefined;

    const { conversationId, priorStatus, inserted, needsProfile, priorStateAt, autoPilot } =
      await processInboundMessage(
        { id: channel.id, businessId: channel.businessId },
        senderId,
        content,
        externalId,
        imageKeys,
        messageKind,
      );

    fbLog('processMessagingEvents persisted', {
      index,
      conversationId,
      priorStatus,
      inserted,
      needsProfile,
    });

    tagContext({ conversationId });
    if (platform === 'instagram') {
      emit('instagram', {
        stage: 'persisted',
        senderId,
        externalId,
        inserted,
        priorStatus,
        needsProfile,
      });
    }

    if (inserted && needsProfile) {
      fbLog('processMessagingEvents enriching profile', {
        index,
        platform,
        conversationId,
        senderId,
      });
      const profile =
        platform === 'instagram'
          ? await getInstagramUserProfile(channel.apiToken, senderId).then((p) => ({
              name: p.name ?? p.username,
              avatar: p.avatar,
            }))
          : await getFacebookUserProfile(channel.apiToken, senderId);
      fbLog('processMessagingEvents profile result', { index, conversationId, profile });
      await setConversationProfileIfMissing(conversationId, profile);
      if (platform === 'instagram') {
        emit('instagram', {
          stage: 'profile',
          senderId,
          externalId,
          profileResolved: Boolean(profile.name || profile.avatar),
          hasName: Boolean(profile.name),
          hasAvatar: Boolean(profile.avatar),
          outcome:
            profile.name || profile.avatar ? undefined : 'profile_unresolved',
        });
      }
    }

    // An in-flight conversation is one whose runner may still be alive — or may
    // have died and left the lock behind. Both cases answer to the same test, so
    // they share the same recovery call rather than two copies of it.
    const inFlight = priorStatus === 'working' || priorStatus === 'pending';
    let outcome: string;
    let ageMs: number | undefined;

    if (!agentOn) {
      // The message stays stored and visible; only the automated answer is skipped.
      outcome = 'business_agent_off';
      fbLog('processMessagingEvents business agent off — message stored, agent skipped', {
        index,
        conversationId,
        inserted,
        priorStatus,
      });
    } else if (!autoPilot) {
      // The message stays stored and visible; only the automated answer is skipped.
      outcome = 'autopilot_off';
      fbLog('processMessagingEvents auto pilot off — message stored, agent skipped', {
        index,
        conversationId,
        inserted,
        priorStatus,
      });
    } else if (!inserted) {
      // Meta re-delivers the same mid because it never saw an answer. That is
      // precisely when the run it waited on is most likely to have died, so the
      // redelivery is treated as a recovery signal too — but only for a lock that
      // has genuinely gone stale, never for the duplicate of a live delivery.
      outcome = 'redelivered';
      fbLog('processMessagingEvents redelivered mid — already stored', { index, conversationId, priorStatus });
      if (channel.agentId && inFlight) {
        ageMs = stateAgeMs(priorStateAt);
        const stale = ageMs > STALE_RUNNER_MS;
        fbLog('processMessagingEvents redelivery stale check', {
          index,
          conversationId,
          priorStatus,
          ageMs,
          staleThresholdMs: STALE_RUNNER_MS,
          isStale: stale,
        });
        if (stale) {
          fbLog('processMessagingEvents recovering stale runner', { index, conversationId, ageMs });
          if (await resetStaleConversation(conversationId, staleBefore())) {
            fbLog('processMessagingEvents stale reset succeeded — re-triggering agent', { index, conversationId });
            outcome = outcomeOf(await triggerAgentRun(conversationId, await budget()), 'redelivered_stale_recovered');
          } else {
            fbLog('processMessagingEvents stale reset lost race — another caller recovered', { index, conversationId });
          }
        } else {
          fbLog('processMessagingEvents runner still fresh — no extra trigger needed', { index, conversationId, ageMs });
        }
      } else if (channel.agentId && (await checkPendingMessages(conversationId))) {
        // The delivery that stored this message committed the row and then died
        // before it could run — which is exactly why Meta is redelivering it.
        // Nothing is in flight, so this copy runs the reply instead of ending
        // the conversation unanswered.
        fbLog('processMessagingEvents redelivery found an unanswered backlog — triggering agent', {
          index,
          conversationId,
          priorStatus,
        });
        outcome = outcomeOf(await triggerAgentRun(conversationId, await budget()), 'redelivered_pending_drained');
      }
    } else if (priorStatus === 'done' && channel.agentId) {
      fbLog('processMessagingEvents triggering agent', { index, conversationId, agentId: channel.agentId });
      outcome = outcomeOf(await triggerAgentRun(conversationId, await budget()), 'agent_triggered');
    } else if (inFlight && channel.agentId) {
      ageMs = stateAgeMs(priorStateAt);
      const stale = ageMs > STALE_RUNNER_MS;
      fbLog('processMessagingEvents stale check', {
        index,
        conversationId,
        priorStatus,
        ageMs,
        staleThresholdMs: STALE_RUNNER_MS,
        isStale: stale,
      });
      if (stale) {
        // Prior execution is presumed dead. Reset the lock and fire a fresh run
        // so the new message (and any others that piled up) get processed.
        fbLog('processMessagingEvents recovering stale runner', { index, conversationId, ageMs });
        if (await resetStaleConversation(conversationId, staleBefore())) {
          fbLog('processMessagingEvents stale reset succeeded — re-triggering agent', { index, conversationId });
          outcome = outcomeOf(await triggerAgentRun(conversationId, await budget()), 'stale_runner_recovered');
        } else {
          fbLog('processMessagingEvents stale reset lost race — another caller recovered', { index, conversationId });
          outcome = 'waited_for_live_runner';
        }
      } else {
        fbLog('processMessagingEvents runner still fresh — no extra trigger needed', { index, conversationId, ageMs });
        outcome = 'waited_for_live_runner';
      }
    } else if (!channel.agentId) {
      // A customer answered by nobody: the channel has no agent attached. The
      // runner names the same invariant from its side when a run is attempted.
      outcome = 'no_agent';
      fbLog('processMessagingEvents no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    } else {
      outcome = 'not_triggered';
      fbLog('processMessagingEvents no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    }

    if (platform === 'instagram') {
      emit('instagram', {
        stage: 'trigger',
        senderId,
        externalId,
        inserted,
        priorStatus,
        outcome,
        ageMs,
      });
    }

    emit('webhook_item', {
      kind: 'message',
      externalId,
      senderId,
      text,
      photoCount: imageKeys.length,
      inserted,
      priorStatus,
      outcome,
      ageMs,
    });
  }

  fbLog('processMessagingEvents done', { channelId: channel.id });
}

type InboundPlatformComment = {
  commentId: string;
  parentId?: string;
  postId: string;
  text: string;
  fromId: string;
  fromName?: string;
  verb?: string;
};

/**
 * The delivery-to-run decisions are identical on both platforms: persist the comment
 * idempotently, enrich what the profile API would give, then either start a run, recover a
 * stale lock, or leave a live one alone. Only the envelope differs, so the shared body
 * lives here and each object's parser feeds it a normalized comment.
 */
async function handleInboundComment(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  platform: ChannelPlatform,
  budget: () => Promise<TriggerOptions>,
  comment: InboundPlatformComment,
  agentOn = true,
): Promise<void> {
  const { commentId, parentId, postId, text, fromId, fromName, verb } = comment;

  fbLog('handleInboundComment inbound', {
    platform,
    commentId,
    fromId,
    fromName: fromName ?? null,
    postId,
    text,
  });

  const { threadId, priorStatus, inserted, needsProfile, priorStateAt } =
    await processInboundComment(
      { id: channel.id, businessId: channel.businessId },
      fromId,
      fromName,
      postId,
      text,
      commentId,
      parentId,
    );

  fbLog('handleInboundComment persisted', {
    platform,
    threadId,
    priorStatus,
    inserted,
    needsProfile,
  });
  tagContext({ commentThreadId: threadId });
  if (platform === 'instagram') {
    emit('instagram', {
      stage: 'comment_persisted',
      commentId,
      mediaId: postId,
      parentId,
      fromId,
      fromName,
      text,
      inserted,
      priorStatus,
      needsProfile,
    });
  }

  // Instagram releases a commenter's profile only after that person has messaged the
  // business, so a comment thread already has everything it can get: the username from
  // the webhook. Asking anyway would be one refused Graph call per comment.
  if (inserted && needsProfile && platform === 'facebook') {
    fbLog('handleInboundComment enriching avatar', { platform, threadId, fromId });
    const profile = await getFacebookUserProfile(channel.apiToken, fromId);
    fbLog('handleInboundComment profile result', { platform, threadId, profile });
    await setCommentThreadProfileIfMissing(threadId, profile);
  }

  const inFlight = priorStatus === 'working' || priorStatus === 'pending';
  let outcome: string;
  let ageMs: number | undefined;

  if (!agentOn) {
    // Stored for the inbox, never answered while the business kill switch is off.
    outcome = 'business_agent_off';
    fbLog('handleInboundComment business agent off — comment stored, agent skipped', {
      platform,
      threadId,
      inserted,
      priorStatus,
    });
  } else if (!inserted) {
    // A re-delivered comment id: Meta is still waiting for an answer, so the
    // runner it waited on is a candidate for recovery just as above.
    outcome = 'redelivered';
    fbLog('handleInboundComment redelivered comment — already stored', {
      platform,
      threadId,
      priorStatus,
    });
    if (channel.agentId && inFlight) {
      ageMs = stateAgeMs(priorStateAt);
      const stale = ageMs > STALE_RUNNER_MS;
      fbLog('handleInboundComment redelivery stale check', {
        platform,
        threadId,
        priorStatus,
        ageMs,
        staleThresholdMs: STALE_RUNNER_MS,
        isStale: stale,
      });
      if (stale) {
        fbLog('handleInboundComment recovering stale runner', { platform, threadId, ageMs });
        if (await resetStaleCommentThread(threadId, staleBefore())) {
          fbLog('handleInboundComment stale reset succeeded — re-triggering comment agent', {
            platform,
            threadId,
          });
          outcome = outcomeOf(
            await triggerCommentRun(threadId, await budget()),
            'redelivered_stale_recovered',
          );
        } else {
          fbLog('handleInboundComment stale reset lost race — another caller recovered', {
            platform,
            threadId,
          });
        }
      } else {
        fbLog('handleInboundComment runner still fresh — no extra trigger needed', {
          platform,
          threadId,
          ageMs,
        });
      }
    } else if (channel.agentId && (await checkPendingComments(threadId))) {
      // Same safety net as the messenger path: the delivery that stored this
      // comment died after committing it, so this redelivery runs the reply.
      fbLog('handleInboundComment redelivery found an unanswered backlog — triggering comment agent', {
        platform,
        threadId,
        priorStatus,
      });
      outcome = outcomeOf(
        await triggerCommentRun(threadId, await budget()),
        'redelivered_pending_drained',
      );
    }
  } else if (priorStatus === 'done' && channel.agentId) {
    fbLog('handleInboundComment triggering comment agent', {
      platform,
      threadId,
      agentId: channel.agentId,
    });
    outcome = outcomeOf(await triggerCommentRun(threadId, await budget()), 'comment_run_triggered');
  } else if (inFlight && channel.agentId) {
    ageMs = stateAgeMs(priorStateAt);
    const stale = ageMs > STALE_RUNNER_MS;
    fbLog('handleInboundComment stale check', {
      platform,
      threadId,
      priorStatus,
      ageMs,
      staleThresholdMs: STALE_RUNNER_MS,
      isStale: stale,
    });
    if (stale) {
      // Prior execution is presumed dead. Reset the lock and fire a fresh run.
      fbLog('handleInboundComment recovering stale runner', { platform, threadId, ageMs });
      if (await resetStaleCommentThread(threadId, staleBefore())) {
        fbLog('handleInboundComment stale reset succeeded — re-triggering comment agent', {
          platform,
          threadId,
        });
        outcome = outcomeOf(
          await triggerCommentRun(threadId, await budget()),
          'stale_runner_recovered',
        );
      } else {
        fbLog('handleInboundComment stale reset lost race — another caller recovered', {
          platform,
          threadId,
        });
        outcome = 'waited_for_live_runner';
      }
    } else {
      fbLog('handleInboundComment runner still fresh — no extra trigger needed', {
        platform,
        threadId,
        ageMs,
      });
      outcome = 'waited_for_live_runner';
    }
  } else if (!channel.agentId) {
    outcome = 'no_agent';
    fbLog('handleInboundComment no agent trigger', {
      platform,
      inserted,
      priorStatus,
      hasAgent: Boolean(channel.agentId),
    });
  } else {
    outcome = 'not_triggered';
    fbLog('handleInboundComment no agent trigger', {
      platform,
      inserted,
      priorStatus,
      hasAgent: Boolean(channel.agentId),
    });
  }

  if (platform === 'instagram') {
    emit('instagram', {
      stage: 'comment_result',
      commentId,
      mediaId: postId,
      parentId,
      fromId,
      fromName,
      inserted,
      priorStatus,
      outcome,
      ageMs,
    });
  }

  emit('webhook_item', {
    kind: 'comment',
    platform,
    commentId,
    parentId,
    verb,
    fromId,
    fromName,
    text,
    inserted,
    priorStatus,
    outcome,
    ageMs,
  });
}

/**
 * Facebook Page feed changes: filter to newly-added comments, skip the page's
 * own comments (echo equivalent), and route each to its (post, commenter)
 * thread. Each thread is independent → different commenters run in parallel;
 * within a thread the runner processes comments one at a time.
 */
async function processCommentChanges(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  pageId: string,
  changes: WebhookChange[],
  agentOn = true,
): Promise<void> {
  fbLog('processCommentChanges start', { channelId: channel.id, pageId, changeCount: changes.length });
  const budget = forTrigger(channel.businessId);

  for (const [index, change] of changes.entries()) {
    fbLog('processCommentChanges change', { index, change });

    if (change.field !== 'feed') {
      fbLog('processCommentChanges skip — not feed field', { index, field: change.field ?? null });
      continue;
    }

    const value = change.value;
    if (value?.item !== 'comment' || value.verb !== 'add') {
      fbLog('processCommentChanges skip — not new comment', {
        index,
        item: value?.item ?? null,
        verb: value?.verb ?? null,
      });
      continue;
    }

    const commentId = value.comment_id;
    const text = value.message;
    const fromId = value.from?.id;
    const parentId = facebookParentCommentId(value.parent_id, value.post_id);

    if (!commentId || !text || !fromId) {
      // A new comment we cannot route. If Meta changes the shape, or a comment
      // arrives with only an attachment, this is the only trace of it.
      fbLog('processCommentChanges skip — missing comment fields', {
        index,
        commentId: commentId ?? null,
        hasText: Boolean(text),
        fromId: fromId ?? null,
      });
      emit('webhook_item', {
        kind: 'comment',
        platform: 'facebook',
        commentId,
        parentId,
        verb: value.verb,
        fromId,
        fromName: value.from?.name,
        text,
        outcome: 'incomplete_payload',
      });
      continue;
    }

    if (fromId === pageId) {
      fbLog('processCommentChanges skip — page own comment (echo)', { index, commentId, fromId });
      continue; // the page's own comment — an echo, not a customer
    }

    await handleInboundComment(channel, 'facebook', budget, {
      commentId,
      parentId,
      postId: value.post_id ?? '',
      text,
      fromId,
      fromName: value.from?.name,
      verb: value.verb,
    }, agentOn);
  }

  fbLog('processCommentChanges done', { channelId: channel.id });
}

/**
 * Instagram comments arrive as `changes` on the `instagram` object. There is no `feed`
 * or `verb`: a `comments` field carrying a comment id is a new comment. Live-video
 * comments are deliberately left out — Meta only allows a private reply during the
 * broadcast, so a public answer the agent would otherwise post cannot be delivered.
 */
async function processInstagramChanges(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  instagramAccountId: string,
  changes: WebhookChange[],
  agentOn = true,
): Promise<void> {
  fbLog('processInstagramChanges start', {
    channelId: channel.id,
    instagramAccountId,
    changeCount: changes.length,
  });
  const budget = forTrigger(channel.businessId);

  for (const [index, change] of changes.entries()) {
    fbLog('processInstagramChanges change', { index, change });

    if (change.field !== 'comments') {
      fbLog('processInstagramChanges skip — not a post comment', {
        index,
        field: change.field ?? null,
      });
      emit('instagram', {
        stage: 'comment_event',
        field: change.field,
        outcome: change.field === 'live_comments' ? 'live_comment_skipped' : 'ignored_field',
      });
      continue;
    }

    const value = change.value as unknown as InstagramCommentValue | undefined;
    // Meta's documented shape puts the comment under `comment_id` and the media under
    // `media.id`; a few deliveries still use the older flat ids, so both are read.
    const legacy = (value ?? {}) as {
      id?: string;
      media_id?: string;
      post_id?: string;
      from?: { name?: string };
    };
    const commentId = value?.comment_id ?? legacy.id;
    const text = value?.text;
    const fromId = value?.from?.id;
    const fromName = value?.from?.username ?? legacy.from?.name;
    const postId = value?.media?.id ?? legacy.media_id ?? legacy.post_id;

    if (!commentId || !text || !fromId || !postId) {
      fbLog('processInstagramChanges skip — missing comment fields', {
        index,
        commentId: commentId ?? null,
        hasText: Boolean(text),
        fromId: fromId ?? null,
        postId: postId ?? null,
      });
      emit('instagram', {
        stage: 'comment_event',
        field: change.field,
        commentId,
        mediaId: postId,
        parentId: value?.parent_id,
        fromId,
        fromName,
        text,
        outcome: 'incomplete_payload',
      });
      emit('webhook_item', {
        kind: 'comment',
        platform: 'instagram',
        commentId,
        fromId,
        fromName,
        text,
        outcome: 'incomplete_payload',
      });
      continue;
    }

    if (fromId === instagramAccountId) {
      fbLog('processInstagramChanges skip — account own comment (echo)', {
        index,
        commentId,
        fromId,
      });
      emit('instagram', {
        stage: 'comment_event',
        field: change.field,
        commentId,
        mediaId: postId,
        parentId: value?.parent_id,
        fromId,
        fromName,
        text,
        outcome: 'echo',
      });
      continue;
    }

    emit('instagram', {
      stage: 'comment_event',
      field: change.field,
      commentId,
      mediaId: postId,
      parentId: value?.parent_id,
      fromId,
      fromName,
      text,
    });

    await handleInboundComment(channel, 'instagram', budget, {
      commentId,
      parentId: value?.parent_id || undefined,
      postId,
      text,
      fromId,
      fromName,
    }, agentOn);
  }

  fbLog('processInstagramChanges done', { channelId: channel.id });
}
