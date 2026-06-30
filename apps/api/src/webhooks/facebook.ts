import { Hono } from 'hono';
import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage, setConversationProfileIfMissing } from '@repo/db/crud/conversation';
import { processInboundComment, setCommentThreadProfileIfMissing } from '@repo/db/crud/comment';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { triggerCommentRun } from '@api/lib/comment-runner';
import { runInBackground } from '@api/lib/background';
import { verifyWebhookSignature, getFacebookUserProfile } from '@repo/integrations/facebook';

type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; mid?: string; is_echo?: boolean };
  postback?: { title?: string; payload?: string; mid?: string };
};

function fbLog(message: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`[fb-webhook] ${message}`);
    return;
  }
  console.log(`[fb-webhook] ${message}`, data);
}

function inboundTextFromMessagingEvent(
  ev: MessagingEvent,
): { senderId: string; text: string; externalId?: string } | null {
  if (ev.message?.is_echo) return null;
  const senderId = ev.sender?.id;
  if (!senderId) return null;

  if (ev.message?.text) {
    return { senderId, text: ev.message.text, externalId: ev.message.mid };
  }

  const payload = ev.postback?.payload;
  if (payload) {
    return {
      senderId,
      text: ev.postback?.title ?? payload,
      externalId: ev.postback?.mid,
    };
  }

  return null;
}

type CommentChangeValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  parent_id?: { id?: string };
  message?: string;
  from?: { id?: string; name?: string };
  post_id?: string;
};

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

async function handleTestingForward(c: any, method: 'GET' | 'POST'): Promise<Response | null> {
  if (process.env.TESTING !== 'true') {
    fbLog('[TESTING] Testing mode not enabled');
    return null;
  }

  const targetUrl = 'https://api.oryxa.us/webhooks/facebook';
  const queryStr = c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : '';
  const forwardUrl = `${targetUrl}${queryStr}`;

  fbLog(`[TESTING] Forwarding webhook ${method} request to: ${forwardUrl}`);

  if (method === 'GET') {
    try {
      const res = await fetch(forwardUrl);
      const text = await res.text();
      return c.text(text, res.status as any);
    } catch (err) {
      console.error('[TESTING] Failed to forward GET verification:', err);
      return c.text('Error forwarding', 500);
    }
  }

  // POST request: read text, copy all non-host headers, and execute async fetch
  const rawBody = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.header().forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers[key] = value;
    }
  });

  fetch(forwardUrl, {
    method: 'POST',
    headers,
    body: rawBody,
  }).catch((err) => {
    console.error('[TESTING] Failed to forward POST webhook in background:', err);
  });

  fbLog('[TESTING] Forwarded POST asynchronously (fire and forget) — acknowledging 200 OK');
  return c.text('EVENT_RECEIVED', 200);
}

export const fbWebhookRouter = new Hono();

fbWebhookRouter.get('/facebook', async (c) => {
  const forwardRes = await handleTestingForward(c, 'GET');
  if (forwardRes) return forwardRes;

  const url = new URL(c.req.url);
  const mode = c.req.query('hub.mode') ?? url.searchParams.get('hub.mode');
  const token = c.req.query('hub.verify_token') ?? url.searchParams.get('hub.verify_token');
  const challenge = c.req.query('hub.challenge') ?? url.searchParams.get('hub.challenge');
  const verified = mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN;

  fbLog('GET /facebook', {
    url:c.req.originalUrl,
    mode,
    verifyTokenMatch: verified,
    hasChallenge: Boolean(challenge),
    challengeLength: challenge?.length ?? 0,
  });

  if (verified) {
    fbLog('GET /facebook verify OK — returning challenge');
    return c.text(challenge ?? '');
  }

  fbLog('GET /facebook verify rejected', { mode, verifyTokenMatch: false });
  return c.text('Forbidden', 403);
});

fbWebhookRouter.post('/facebook', async (c) => {
  const forwardRes = await handleTestingForward(c, 'POST');
  if (forwardRes) return forwardRes;

  const signature256 = c.req.header('x-hub-signature-256');
  const signature = c.req.header('x-hub-signature');

  fbLog('POST /facebook received', {
    'x-hub-signature-256': signature256 ?? null,
    'x-hub-signature': signature ?? null,
    contentType: c.req.header('content-type') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });

  const raw = await c.req.text();
  fbLog('POST /facebook raw body', raw);

  const signatureValid = await verifyWebhookSignature(raw, signature256 ?? signature);
  fbLog('POST /facebook signature verification', { valid: signatureValid });

  if (!signatureValid) {
    fbLog('POST /facebook rejected — invalid signature');
    return c.text('Invalid signature', 403);
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch (err) {
    fbLog('POST /facebook rejected — malformed JSON', err);
    return c.text('Malformed JSON', 400);
  }

  fbLog('POST /facebook parsed body', body);

  if (body.object !== 'page' || !Array.isArray(body.entry)) {
    fbLog('POST /facebook rejected — unhandled shape', {
      object: body.object,
      entryIsArray: Array.isArray(body.entry),
    });
    return c.text('Unhandled or malformed webhook', 400);
  }

  fbLog('POST /facebook ack — processing entries', {
    entryCount: body.entry.length,
    pageIds: body.entry.map((e) => e.id),
    vercelInline: Boolean(process.env.VERCEL),
  });

  const work = processEntries(body.entry).catch((err) => {
    console.error('[fb-webhook] background processing failed', err);
  });

  // Hono's Vercel adapter does not provide executionCtx.waitUntil, so background
  // work was being killed as soon as the 200 ack returned. On Vercel, process
  // inline (Meta allows ~20s). Elsewhere, ack fast and finish in background.
  if (process.env.VERCEL) {
    await work;
  } else {
    runInBackground(c, work);
  }

  return c.text('EVENT_RECEIVED', 200);
});

/**
 * Processes every entry in a batched webhook payload. A single page can deliver
 * either Messenger `messaging` events (DMs) or `changes` events (page feed,
 * including comments) — both are handled here, with the channel looked up once
 * per page.
 */
async function processEntries(entries: WebhookEntry[]): Promise<void> {
  fbLog('processEntries start', { entryCount: entries.length });

  for (const entry of entries) {
    const messagingCount = entry.messaging?.length ?? 0;
    const changesCount = entry.changes?.length ?? 0;
    const hasMessaging = messagingCount > 0;
    const hasChanges = changesCount > 0;

    fbLog('processEntries entry', {
      pageId: entry.id,
      messagingCount,
      changesCount,
      messaging: entry.messaging,
      changes: entry.changes,
    });

    if (!hasMessaging && !hasChanges) {
      fbLog('processEntries skip entry — no messaging or changes', { pageId: entry.id });
      continue;
    }

    const channel = await getChannelByPageId(entry.id);
    if (!channel) {
      fbLog('processEntries skip entry — unknown page (no channel)', { pageId: entry.id });
      continue;
    }

    fbLog('processEntries channel resolved', {
      pageId: entry.id,
      channelId: channel.id,
      businessId: channel.businessId,
      agentId: channel.agentId ?? null,
    });

    if (hasMessaging) {
      await processMessagingEvents(channel, entry.messaging!);
    }
    if (hasChanges) {
      await processCommentChanges(channel, entry.id, entry.changes!);
    }
  }

  fbLog('processEntries done');
}

/** Messenger DM events: dedup on mid, skip echoes + non-text/postback, trigger agent, enrich profile. */
async function processMessagingEvents(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  events: MessagingEvent[],
): Promise<void> {
  fbLog('processMessagingEvents start', { channelId: channel.id, eventCount: events.length });

  for (const [index, ev] of events.entries()) {
    fbLog('processMessagingEvents event', { index, event: ev });

    const inbound = inboundTextFromMessagingEvent(ev);
    if (!inbound) {
      fbLog('processMessagingEvents skip event — not actionable text/postback', {
        index,
        isEcho: ev.message?.is_echo ?? false,
        hasText: Boolean(ev.message?.text),
        hasPostback: Boolean(ev.postback?.payload),
        senderId: ev.sender?.id ?? null,
      });
      continue;
    }

    const { senderId, text, externalId } = inbound;
    fbLog('processMessagingEvents inbound', { index, senderId, text, externalId: externalId ?? null });

    const { conversationId, priorStatus, inserted, needsProfile } = await processInboundMessage(
      { id: channel.id, businessId: channel.businessId },
      senderId,
      text,
      externalId,
    );

    fbLog('processMessagingEvents persisted', {
      index,
      conversationId,
      priorStatus,
      inserted,
      needsProfile,
    });

    if (inserted && needsProfile) {
      fbLog('processMessagingEvents enriching profile', { index, conversationId, senderId });
      const profile = await getFacebookUserProfile(channel.apiToken, senderId);
      fbLog('processMessagingEvents profile result', { index, conversationId, profile });
      await setConversationProfileIfMissing(conversationId, profile);
    }

    if (inserted && priorStatus === 'done' && channel.agentId) {
      fbLog('processMessagingEvents triggering agent', { index, conversationId, agentId: channel.agentId });
      await triggerAgentRun(conversationId);
    } else {
      fbLog('processMessagingEvents no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    }
  }

  fbLog('processMessagingEvents done', { channelId: channel.id });
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
): Promise<void> {
  fbLog('processCommentChanges start', { channelId: channel.id, pageId, changeCount: changes.length });

  for (const [index, change] of changes.entries()) {
    fbLog('processCommentChanges change', { index, change });

    if (change.field !== 'feed') {
      fbLog('processCommentChanges skip — not feed field', { index, field: change.field ?? null });
      continue;
    }

    const value = change.value;
    if (!value || value.item !== 'comment' || value.verb !== 'add') {
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
    if (!commentId || !text || !fromId) {
      fbLog('processCommentChanges skip — missing comment fields', {
        index,
        commentId: commentId ?? null,
        hasText: Boolean(text),
        fromId: fromId ?? null,
      });
      continue;
    }

    if (fromId === pageId) {
      fbLog('processCommentChanges skip — page own comment (echo)', { index, commentId, fromId });
      continue;
    }

    fbLog('processCommentChanges inbound comment', {
      index,
      commentId,
      fromId,
      fromName: value.from?.name ?? null,
      postId: value.post_id ?? null,
      text,
    });

    const { threadId, priorStatus, inserted, needsProfile } = await processInboundComment(
      { id: channel.id, businessId: channel.businessId },
      fromId,
      value.from?.name,
      value.post_id ?? '',
      text,
      commentId,
      value.parent_id?.id,
    );

    fbLog('processCommentChanges persisted', {
      index,
      threadId,
      priorStatus,
      inserted,
      needsProfile,
    });

    if (inserted && needsProfile) {
      fbLog('processCommentChanges enriching avatar', { index, threadId, fromId });
      const profile = await getFacebookUserProfile(channel.apiToken, fromId);
      fbLog('processCommentChanges profile result', { index, threadId, profile });
      await setCommentThreadProfileIfMissing(threadId, profile);
    }

    if (inserted && priorStatus === 'done' && channel.agentId) {
      fbLog('processCommentChanges triggering comment agent', { index, threadId, agentId: channel.agentId });
      await triggerCommentRun(threadId);
    } else {
      fbLog('processCommentChanges no agent trigger', {
        index,
        inserted,
        priorStatus,
        hasAgent: Boolean(channel.agentId),
      });
    }
  }

  fbLog('processCommentChanges done', { channelId: channel.id });
}
