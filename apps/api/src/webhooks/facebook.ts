import { Hono } from 'hono';
import { getChannelByPageId } from '@repo/db/crud/channel';
import { processInboundMessage } from '@repo/db/crud/conversation';
import { triggerAgentRun } from '../lib/agent-runner';

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
  const body = await c.req.json().catch(() => null);

  if (!body || body.object !== 'page' || !body.entry?.[0]) {
    return c.text('Unhandled or malformed webhook', 400);
  }

  const entry = body.entry[0];
  const messaging = entry.messaging?.[0];
  if (!messaging?.message?.text) {
    return c.text('EVENT_RECEIVED', 200);
  }

  const senderId = messaging.sender.id;
  const text = messaging.message.text;
  const pageId = entry.id;

  const channel = await getChannelByPageId(pageId);
  if (!channel) {
    return c.text('EVENT_RECEIVED', 200);
  }

  const { conversationId, priorStatus } = await processInboundMessage(
    { id: channel.id, businessId: channel.businessId },
    senderId,
    text,
  );

  if (priorStatus !== 'pending' && priorStatus !== 'working' && channel.agentId) {
    triggerAgentRun(conversationId);
  }

  return c.text('EVENT_RECEIVED', 200);
});
