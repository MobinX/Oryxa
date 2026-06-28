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
  deleteConversation,
} from '@repo/db/crud/conversation';
import { sendMessage } from '@repo/integrations/facebook';
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
    convs.map((conv) => ({
      id: conv.id,
      customerName: conv.customerName,
      lastMessageState: conv.lastMessageState,
      channelId: conv.channelId,
      customerPlatformId: conv.customerPlatformId,
      createdAt: conv.createdAt.toISOString(),
    })),
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
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const query = c.req.valid('query');
  const msgs = await listMessages(conversationId, businessId, query.limit);
  if (!msgs) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(msgs);
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
  },
});

conversationsRouter.openapi(createMessageRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const data = c.req.valid('json');

  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv?.channel) return c.json({ error: 'Conversation not found' }, 404);

  await sendMessage(conv.channel.apiToken, conv.customerPlatformId, data.content);

  const message = await createMessage({
    conversationId,
    from: 'self',
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
