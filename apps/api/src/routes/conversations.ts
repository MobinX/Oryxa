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
  updateAutoPilotInputSchema,
  updateAutoPilotOutputSchema,
  generateSuggestionsOutputSchema,
  sendSuggestionInputSchema,
  sendSuggestionOutputSchema,
  createConversationOrderInputSchema,
  createConversationOrderOutputSchema,
  conversationOrderDefaultsSchema,
} from '@repo/shared';
import { createOrder } from '@repo/db/crud/order';
import { runSuggestionAgent } from '@api/lib/suggestion-runner';
import { sendSuggestionAsCards } from '@api/lib/suggestion-sender';
import { getConversationOrderDefaults } from '@api/lib/order-defaults';
import {
  listConversations,
  listMessages,
  createMessage,
  getConversationForBusiness,
  updateConversationState,
  deleteConversation,
  setConversationAutoPilot,
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
        autoPilot: conv.autoPilot,
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
    500: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Internal error' },
  },
});

conversationsRouter.openapi(listMessagesRoute, async (c) => {
  try {
    const businessId = c.req.param('businessId');
    const conversationId = c.req.param('conversationId');
    const query = c.req.valid('query');
    const msgs = await listMessages(conversationId, businessId, query.limit);
    if (!msgs) return c.json({ error: 'Conversation not found' }, 404);
    return c.json(msgs, 200);
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
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Conversation not found',
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
  return c.json({ id: conversationId, updatedState: state }, 200);
});

const updateAutoPilotRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/conversations/{conversationId}/auto-pilot',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateAutoPilotInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: updateAutoPilotOutputSchema } },
      description: 'Auto pilot updated',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Conversation not found',
    },
  },
});

conversationsRouter.openapi(updateAutoPilotRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const { autoPilot } = c.req.valid('json');

  const row = await setConversationAutoPilot(conversationId, businessId, autoPilot);
  if (!row) return c.json({ error: 'Conversation not found' }, 404);
  return c.json({ id: row.id, autoPilot: row.autoPilot }, 200);
});

const generateSuggestionsRoute = createRoute({
  method: 'post',
  path: '/{businessId}/conversations/{conversationId}/suggestions',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: generateSuggestionsOutputSchema } },
      description: 'Suggestions for the latest customer turn (empty when auto pilot is on)',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Conversation not found',
    },
  },
});

conversationsRouter.openapi(generateSuggestionsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');

  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const result = await runSuggestionAgent(conversationId);
  return c.json(result, 200);
});

const sendSuggestionRoute = createRoute({
  method: 'post',
  path: '/{businessId}/conversations/{conversationId}/suggestions/send',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: sendSuggestionInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: sendSuggestionOutputSchema } },
      description: 'Cards delivered to the customer',
    },
    400: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Nothing sendable in this suggestion',
    },
  },
});

conversationsRouter.openapi(sendSuggestionRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const input = c.req.valid('json');

  try {
    const result = await sendSuggestionAsCards(businessId, conversationId, input);
    return c.json({ sent: true, cards: result.cards }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send the suggestion';
    return c.json({ error: message }, 400);
  }
});

const conversationOrderDefaultsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/conversations/{conversationId}/order-defaults',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: conversationOrderDefaultsSchema } },
      description: 'Quantity, phone and address already known for this customer',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Conversation not found',
    },
  },
});

conversationsRouter.openapi(conversationOrderDefaultsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(await getConversationOrderDefaults(businessId, conversationId), 200);
});

const createConversationOrderRoute = createRoute({
  method: 'post',
  path: '/{businessId}/conversations/{conversationId}/orders',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), conversationId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createConversationOrderInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: createConversationOrderOutputSchema } },
      description: 'Order created for the conversation customer',
    },
    400: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'The order could not be created',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Conversation not found',
    },
  },
});

conversationsRouter.openapi(createConversationOrderRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const conversationId = c.req.param('conversationId');
  const input = c.req.valid('json');

  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  try {
    const order = await createOrder({
      businessId,
      productId: input.productId,
      variantId: input.variantId,
      count: input.count,
      customerName: input.customerName.trim() || conv.customerName || 'Customer',
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      shippingCost: input.shippingCost,
      paymentMethod: input.paymentMethod,
      transactionId: input.transactionId,
      conversationId,
      customerPlatformId: conv.customerPlatformId,
    });
    return c.json(
      {
        id: order.id,
        totalPrice: order.totalPrice,
        customerId: order.customerId,
        state: order.state,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The order could not be created';
    return c.json({ error: message }, 400);
  }
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
  return c.json(result, 200);
});
