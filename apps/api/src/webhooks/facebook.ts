import { Hono } from 'hono';
import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { triggerAgentRun } from '@api/lib/agent-runner';
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

  // Meta batches multiple pages (entries) and multiple messaging events per
  // delivery. Process every entry and every event — indexing only [0] drops
  // messages and breaks multi-page inbound.
  for (const entry of body.entry) {
    const events = entry.messaging ?? [];
    if (events.length === 0) continue;

    // Look up the channel once per page (entry), lazily on the first event.
    const channel = await getChannelByPageId(entry.id);
    if (!channel) continue;

    for (const ev of events) {
      // Skip echoes (the bot's own sent messages) — otherwise replies get
      // re-ingested as inbound customer messages and can loop.
      if (ev.message?.is_echo) continue;
      // Only text replies are handled today; attachments/postback/delivery/read
      // are acked without creating a phantom message.
      const text = ev.message?.text;
      const senderId = ev.sender?.id;
      if (!text || !senderId) continue;

      // Dedup on Meta's message id — Meta retries webhooks and without this a
      // retried delivery becomes a duplicate message + duplicate agent reply.
      const { conversationId, priorStatus, inserted } = await processInboundMessage(
        { id: channel.id, businessId: channel.businessId },
        senderId,
        text,
        ev.message?.mid,
      );

      if (inserted && priorStatus !== 'pending' && priorStatus !== 'working' && channel.agentId) {
        triggerAgentRun(conversationId);
      }
    }
  }

  return c.text('EVENT_RECEIVED', 200);
});
