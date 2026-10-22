import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  listConversationsQuerySchema,
  conversationListItemSchema,
  listMessagesQuerySchema,
  messageSchema,
  createMessageInputSchema,
  createMessageOutputSchema,
  updateConversationStateInputSchema,
  updateConversationStateOutputSchema,
  deleteConversationOutputSchema,
} from '@repo/shared';
import {
  listConversations,
  listMessages,
  createMessage,
  getConversationForBusiness,
  updateConversationState,
  setConversationAiPaused,
  deleteConversation,
} from '@repo/db/crud/conversation';
import { sendMessage, isFacebookSendError } from '@repo/integrations/facebook';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const conversationsRouter = new OpenAPIHono();

conversationsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const listConversationsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/conversations',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: listConversationsQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(conversationListItemSchema) } },
      description: 'Conversations',
    },
  },
});

conversationsRouter.openapi(listConversationsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const query = c.req.valid('query');
  const convs = await listConversations(businessId, query);
  return c.json(
    convs.map((conv) => {
      let pageName: string | null = null;
      if (conv.channel?.extraInfo) {
        try {
          const info = JSON.parse(conv.channel.extraInfo) as { pageName?: string };
          pageName = info.pageName ?? null;
        } catch {
          // ignore malformed JSON
        }
      }
      return {
        id: conv.id,
        customerName: conv.customerName,
        lastMessageState: conv.lastMessageState,
        channelId: conv.channelId,
        customerPlatformId: conv.customerPlatformId,
        createdAt: conv.createdAt.toISOString(),
        pageName,
        /** Spec E takeover state; the inbox shows the "AI paused" badge from it. */
        aiPaused: conv.aiPaused,
      };
    }),
  );
});

const listMessagesRoute = createRoute({
  method: 'get',
  path: '/{businessId}/conversations/{conversationId}/messages',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    query: listMessagesQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.array(messageSchema) } }, description: 'Messages' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

conversationsRouter.openapi(listMessagesRoute, async (c) => {
  try {
    const businessId = c.req.param('businessId');
    const conversationId = c.req.param('conversationId');
    const query = c.req.valid('query');
    const msgs = await listMessages(conversationId, businessId, query.limit);
    if (!msgs) return c.json({ error: 'Conversation not found' }, 404);
    return c.json(msgs);
  } catch (err) {
    console.error('[conversationsRouter] listMessages failed:', err);
    return c.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, 500);
  }
});

const createMessageRoute = createRoute({
  method: 'post',
  path: '/{businessId}/conversations/{conversationId}/messages',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createMessageInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: createMessageOutputSchema } }, description: 'Message sent' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
    422: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Facebook rejected the send',
    },
  },
});

conversationsRouter.openapi(createMessageRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const data = c.req.valid('json');

  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv?.channel) return c.json({ error: 'Conversation not found' }, 404);

  try {
    // Inbox UI path — always HUMAN_AGENT. Agent tools call sendMessage without this flag.
    await sendMessage(conv.channel.apiToken, conv.customerPlatformId, data.content, {
      humanAgent: true,
      platform: conv.channel.platform === 'instagram' ? 'instagram' : 'facebook',
    });
  } catch (err) {
    if (isFacebookSendError(err)) {
      return c.json({ error: err.userMessage }, 422);
    }
    throw err;
  }

  const message = await createMessage({
    conversationId,
    from: 'self',
    sentBy: 'human',
    content: data.content,
    contentType: data.contentType,
    state: 'done',
  });

  await updateConversationState(conversationId, 'done');

  return c.json({ id: message.id, time: message.time.toISOString() }, 201);
});

const updateStateRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/conversations/{conversationId}/state',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateConversationStateInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: updateConversationStateOutputSchema } },
      description: 'State updated',
    },
  },
});

conversationsRouter.openapi(updateStateRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const { state } = c.req.valid('json');

  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  await updateConversationState(conversationId, state);
  return c.json({ id: conversationId, updatedState: state });
});

/**
 * Human takeover (spec E): `paused: true` hands the customer from the AI to the operator —
 * the runner gate sees `aiPaused` and never answers until someone pauses it off.
 * Belongs to the same bearer-auth surface the inbox already runs behind.
 */
const aiPauseRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/conversations/{conversationId}/ai',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: z.object({ paused: z.boolean() }) } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ id: z.string(), aiPaused: z.boolean() }) } },
      description: 'Takeover state updated',
    },
  },
});

conversationsRouter.openapi(aiPauseRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const { paused } = c.req.valid('json');

  const row = await setConversationAiPaused(businessId, conversationId, paused);
  return c.json({ id: conversationId, aiPaused: row?.aiPaused ?? paused });
});

const deleteConversationRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/conversations/{conversationId}',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: deleteConversationOutputSchema } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

conversationsRouter.openapi(deleteConversationRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const result = await deleteConversation(businessId, conversationId);
  if (!result) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(result);
});
