import { Hono } from 'hono';
import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { runInBackground } from '@api/lib/background';
import { verifyWebhookSignature } from '@repo/integrations/facebook';

type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; mid?: string; is_echo?: boolean };
};

type WebhookEntry = {
  id: string;
  messaging?: MessagingEvent[];
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
  // work (per-page channel lookup, idempotent insert, agent trigger) runs in
  // the background, kept alive via waitUntil on edge or fire-and-forget on Node.
  runInBackground(c, processEntries(body.entry));
  return c.text('EVENT_RECEIVED', 200);
});

/**
 * Processes every entry (one per page) and every messaging event in a batched
 * webhook payload. Looks up the channel once per page, dedups on Meta's message
 * id, skips echoes and non-text events, and triggers the agent only for a
 * genuinely new message on an idle conversation.
 */
async function processEntries(entries: WebhookEntry[]): Promise<void> {
  for (const entry of entries) {
    const events = entry.messaging ?? [];
    if (events.length === 0) continue;

    const channel = await getChannelByPageId(entry.id);
    if (!channel) continue;

    for (const ev of events) {
      // Skip echoes (the bot's own sent messages) so replies aren't re-ingested.
      if (ev.message?.is_echo) continue;
      const text = ev.message?.text;
      const senderId = ev.sender?.id;
      if (!text || !senderId) continue;

      const { conversationId, priorStatus, inserted } = await processInboundMessage(
        { id: channel.id, businessId: channel.businessId },
        senderId,
        text,
        ev.message?.mid,
      );

      // Only trigger an agent run for a brand-new message on an idle ('done')
      // conversation. The actual run is gated by an atomic claim in
      // runAgentForConversation, so concurrent triggers can't double-run.
      if (inserted && priorStatus === 'done' && channel.agentId) {
        triggerAgentRun(conversationId);
      }
    }
  }
}
