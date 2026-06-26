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
};

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

export const fbWebhookRouter = new Hono();

fbWebhookRouter.get('/facebook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return c.text(challenge ?? '');
  }
  return c.text('Forbidden', 403);
});

fbWebhookRouter.post('/facebook', async (c) => {
  // Verify the signature over the raw body before anything else.
  const raw = await c.req.text();
  if (!(await verifyWebhookSignature(raw, c.req.header('x-hub-signature-256') ?? c.req.header('x-hub-signature')))) {
    return c.text('Invalid signature', 403);
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return c.text('Malformed JSON', 400);
  }

  if (body.object !== 'page' || !Array.isArray(body.entry)) {
    return c.text('Unhandled or malformed webhook', 400);
  }

  // Acknowledge immediately so Meta doesn't time out and retry. The actual DB
  // work (per-page channel lookup, idempotent insert, agent/comment trigger)
  // runs in the background, kept alive via waitUntil on edge or fire-and-forget
  // on Node.
  runInBackground(c, processEntries(body.entry));
  return c.text('EVENT_RECEIVED', 200);
});

/**
 * Processes every entry in a batched webhook payload. A single page can deliver
 * either Messenger `messaging` events (DMs) or `changes` events (page feed,
 * including comments) — both are handled here, with the channel looked up once
 * per page.
 */
async function processEntries(entries: WebhookEntry[]): Promise<void> {
  for (const entry of entries) {
    const hasMessaging = (entry.messaging?.length ?? 0) > 0;
    const hasChanges = (entry.changes?.length ?? 0) > 0;
    if (!hasMessaging && !hasChanges) continue;

    const channel = await getChannelByPageId(entry.id);
    if (!channel) continue;

    if (hasMessaging) {
      await processMessagingEvents(channel, entry.messaging!);
    }
    if (hasChanges) {
      await processCommentChanges(channel, entry.id, entry.changes!);
    }
  }
}

/** Messenger DM events: dedup on mid, skip echoes + non-text, trigger agent, enrich profile. */
async function processMessagingEvents(
  channel: { id: string; businessId: string; agentId?: string | null; apiToken: string },
  events: MessagingEvent[],
): Promise<void> {
  for (const ev of events) {
    if (ev.message?.is_echo) continue;
    const text = ev.message?.text;
    const senderId = ev.sender?.id;
    if (!text || !senderId) continue;

    const { conversationId, priorStatus, inserted, needsProfile } = await processInboundMessage(
      { id: channel.id, businessId: channel.businessId },
      senderId,
      text,
      ev.message?.mid,
    );

    // Name/avatar aren't in the Messenger payload — look them up from the Graph
    // API once (only while missing) and cache on the conversation. Best-effort:
    // a failed lookup just leaves them empty and retries next inbound.
    if (inserted && needsProfile) {
      const profile = await getFacebookUserProfile(channel.apiToken, senderId);
      await setConversationProfileIfMissing(conversationId, profile);
    }

    // Only trigger an agent run for a brand-new message on an idle ('done')
    // conversation. The actual run is gated by an atomic claim in
    // runAgentForConversation, so concurrent triggers can't double-run.
    if (inserted && priorStatus === 'done' && channel.agentId) {
      triggerAgentRun(conversationId);
    }
  }
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
  for (const change of changes) {
    if (change.field !== 'feed') continue;
    const value = change.value;
    if (!value || value.item !== 'comment' || value.verb !== 'add') continue;

    const commentId = value.comment_id;
    const text = value.message;
    const fromId = value.from?.id;
    if (!commentId || !text || !fromId) continue;

    // Skip the page's own comments (the bot's replies come back as feed events).
    if (fromId === pageId) continue;

    const { threadId, priorStatus, inserted, needsProfile } = await processInboundComment(
      { id: channel.id, businessId: channel.businessId },
      fromId,
      value.from?.name,
      value.post_id ?? '',
      text,
      commentId,
      value.parent_id?.id,
    );

    // The webhook gives us the name but not the avatar; look the avatar up from
    // the Graph API once (only while missing) and cache it on the thread.
    if (inserted && needsProfile) {
      const profile = await getFacebookUserProfile(channel.apiToken, fromId);
      await setCommentThreadProfileIfMissing(threadId, profile);
    }

    if (inserted && priorStatus === 'done' && channel.agentId) {
      triggerCommentRun(threadId);
    }
  }
}
