import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createAgentInputSchema,
  createAgentOutputSchema,
  selectAgentSchema,
  createChannelInputSchema,
  createChannelOutputSchema,
  updateChannelAgentSchema,
} from '@repo/shared';
import {
  createAgent,
  listAgents,
  createChannel,
  listChannels,
  updateChannelAgent,
} from '@repo/db/crud/channel';
import { getFacebookOAuthUrl, exchangeCodeForToken, getUserPages } from '@repo/integrations/facebook';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const channelsRouter = new OpenAPIHono();

channelsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const createAgentRoute = createRoute({
  method: 'post',
  path: '/{businessId}/agents',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createAgentInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: createAgentOutputSchema } }, description: 'Agent created' },
  },
});

channelsRouter.openapi(createAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  const agent = await createAgent(businessId, data);
  return c.json({ id: agent.id, createdAt: agent.createdAt.toISOString() }, 201);
});

const listAgentsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/agents',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(selectAgentSchema) } },
      description: 'Agents',
    },
  },
});

channelsRouter.openapi(listAgentsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const agents = await listAgents(businessId);
  return c.json(
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      platformType: a.platformType,
      systemPrompt: a.systemPrompt,
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

const createChannelRoute = createRoute({
  method: 'post',
  path: '/{businessId}/channels',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createChannelInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: createChannelOutputSchema } }, description: 'Channel linked' },
  },
});

channelsRouter.openapi(createChannelRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  const channel = await createChannel(businessId, data);
  return c.json(channel, 201);
});

const listChannelsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/channels',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.string().uuid(),
              platform: z.string(),
              platformChannelId: z.string(),
              agentId: z.string().uuid().nullable(),
            }),
          ),
        },
      },
      description: 'Channels',
    },
  },
});

channelsRouter.openapi(listChannelsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channels = await listChannels(businessId);
  return c.json(
    channels.map((ch) => ({
      id: ch.id,
      platform: ch.platform,
      platformChannelId: ch.platformChannelId,
      agentId: ch.agentId,
    })),
  );
});

const updateChannelAgentRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/channels/{channelId}/agent',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), channelId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateChannelAgentSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Updated' },
  },
});

channelsRouter.openapi(updateChannelAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channelId = c.req.param('channelId');
  const { agentId } = c.req.valid('json');
  const result = await updateChannelAgent(channelId, businessId, agentId);
  if (!result) return c.json({ error: 'Channel not found' }, 404);
  return c.json(result);
});

// Facebook OAuth
const fbAuthRoute = createRoute({
  method: 'get',
  path: '/{businessId}/channels/facebook/auth',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ url: z.string() }) } }, description: 'OAuth URL' },
  },
});

channelsRouter.openapi(fbAuthRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const url = getFacebookOAuthUrl(businessId);
  return c.json({ url });
});

export const facebookCallbackRouter = new OpenAPIHono();

facebookCallbackRouter.get('/auth/facebook/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('Missing code or state', 400);

  try {
    const userToken = await exchangeCodeForToken(code);
    const pages = await getUserPages(userToken);
    if (pages.length === 0) return c.text('No pages found', 400);

    const page = pages[0];
    await createChannel(state, {
      platform: 'facebook',
      apiToken: page.access_token,
      platformChannelId: page.id,
      extraInfo: JSON.stringify({ pageName: page.name }),
    });

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3400';
    return c.redirect(`${webUrl}/b/${state}/channels?connected=facebook`);
  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return c.text('OAuth failed', 500);
  }
});
