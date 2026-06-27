import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createAgentInputSchema,
  createAgentOutputSchema,
  selectAgentSchema,
  updateAgentInputSchema,
  updateAgentOutputSchema,
  deleteAgentOutputSchema,
  createChannelInputSchema,
  createChannelOutputSchema,
  updateChannelAgentSchema,
  updateChannelInputSchema,
  updateChannelOutputSchema,
  deleteChannelOutputSchema,
  facebookPendingPagesQuerySchema,
  facebookPendingPageSchema,
  facebookConnectPagesInputSchema,
  facebookConnectPagesOutputSchema,
} from '@repo/shared';
import {
  createAgent,
  getAgentById,
  listAgents,
  updateAgent,
  deleteAgent,
  createChannel,
  listChannels,
  updateChannelAgent,
  updateChannel,
  deleteChannel,
  getChannelByBusinessPlatformChannelId,
  findChannelByBusinessPlatformChannelId,
  reactivateChannel,
} from '@repo/db/crud/channel';
import {
  getFacebookOAuthUrl,
  exchangeCodeForToken,
  getUserPages,
  createOAuthState,
  verifyOAuthState,
  createFacebookPagesSelectionToken,
  verifyFacebookPagesSelectionToken,
  subscribeFacebookPageToWebhooks,
} from '@repo/integrations/facebook';
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

const getAgentRoute = createRoute({
  method: 'get',
  path: '/{businessId}/agents/{agentId}',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid(), agentId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: selectAgentSchema } }, description: 'Agent' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

channelsRouter.openapi(getAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const agentId = c.req.param('agentId');
  const agent = await getAgentById(businessId, agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  return c.json({
    id: agent.id,
    name: agent.name,
    platformType: agent.platformType,
    systemPrompt: agent.systemPrompt,
    createdAt: agent.createdAt.toISOString(),
  });
});

const updateAgentRoute = createRoute({
  method: 'put',
  path: '/{businessId}/agents/{agentId}',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), agentId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateAgentInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: updateAgentOutputSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

channelsRouter.openapi(updateAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const agentId = c.req.param('agentId');
  const data = c.req.valid('json');
  const result = await updateAgent(businessId, agentId, data);
  if (!result) return c.json({ error: 'Agent not found' }, 404);
  return c.json(result);
});

const deleteAgentRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/agents/{agentId}',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid(), agentId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: deleteAgentOutputSchema } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

channelsRouter.openapi(deleteAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const agentId = c.req.param('agentId');
  const result = await deleteAgent(businessId, agentId);
  if (!result) return c.json({ error: 'Agent not found' }, 404);
  return c.json(result);
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
              pageName: z.string().nullable().optional(),
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
    channels.map((ch) => {
      let pageName: string | null = null;
      if (ch.extraInfo) {
        try {
          const info = JSON.parse(ch.extraInfo) as { pageName?: string };
          pageName = info.pageName ?? null;
        } catch {
          pageName = null;
        }
      }
      return {
        id: ch.id,
        platform: ch.platform,
        platformChannelId: ch.platformChannelId,
        pageName,
        agentId: ch.agentId,
      };
    }),
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

const updateChannelRoute = createRoute({
  method: 'put',
  path: '/{businessId}/channels/{channelId}',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), channelId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateChannelInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: updateChannelOutputSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

channelsRouter.openapi(updateChannelRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channelId = c.req.param('channelId');
  const data = c.req.valid('json');
  const result = await updateChannel(businessId, channelId, data);
  if (!result) return c.json({ error: 'Channel not found' }, 404);
  return c.json(result);
});

const deleteChannelRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/channels/{channelId}',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid(), channelId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: deleteChannelOutputSchema } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

channelsRouter.openapi(deleteChannelRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channelId = c.req.param('channelId');
  const result = await deleteChannel(businessId, channelId);
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
  const user = c.get('user');
  // state is a signed, short-lived token bound to this user + business, so the
  // OAuth callback can't be replayed to attach a page to a business the caller
  // doesn't own.
  const state = await createOAuthState({ businessId, userId: user.id });
  const url = getFacebookOAuthUrl(state);
  return c.json({ url });
});

const fbPendingPagesRoute = createRoute({
  method: 'get',
  path: '/{businessId}/channels/facebook/pending',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: facebookPendingPagesQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(facebookPendingPageSchema) } },
      description: 'Facebook pages available to connect after OAuth',
    },
    400: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid token' },
  },
});

channelsRouter.openapi(fbPendingPagesRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const { token } = c.req.valid('query');
  const verified = await verifyFacebookPagesSelectionToken(token);
  if (!verified || verified.businessId !== businessId || verified.userId !== user.id) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }

  const pages = await Promise.all(
    verified.pages.map(async (page) => {
      const existing = await getChannelByBusinessPlatformChannelId(
        businessId,
        'facebook',
        page.id,
      );
      return { id: page.id, name: page.name, connected: !!existing };
    }),
  );
  return c.json(pages);
});

const fbConnectPagesRoute = createRoute({
  method: 'post',
  path: '/{businessId}/channels/facebook/connect',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: facebookConnectPagesInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: facebookConnectPagesOutputSchema } },
      description: 'Selected pages linked',
    },
    400: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid request' },
  },
});

channelsRouter.openapi(fbConnectPagesRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const { token, pageIds } = c.req.valid('json');
  const verified = await verifyFacebookPagesSelectionToken(token);
  if (!verified || verified.businessId !== businessId || verified.userId !== user.id) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }

  const pageById = new Map(verified.pages.map((p) => [p.id, p]));
  const connected: Array<{ id: string; pageId: string; pageName: string }> = [];
  const skipped: string[] = [];
  const failed: Array<{ pageId: string; error: string }> = [];

  for (const pageId of pageIds) {
    const page = pageById.get(pageId);
    if (!page) {
      skipped.push(pageId);
      continue;
    }

    const channelPayload = {
      apiToken: page.access_token,
      extraInfo: JSON.stringify({ pageName: page.name }),
    };

    try {
      const existing = await findChannelByBusinessPlatformChannelId(businessId, 'facebook', page.id);
      let channelId: string;

      if (existing) {
        if (existing.deletedAt) {
          const restored = await reactivateChannel(businessId, existing.id, channelPayload);
          if (!restored) throw new Error('Failed to restore channel');
          channelId = restored.id;
        } else {
          const updated = await updateChannel(businessId, existing.id, channelPayload);
          if (!updated) throw new Error('Failed to update channel');
          channelId = updated.id;
        }
      } else {
        const created = await createChannel(businessId, {
          platform: 'facebook',
          ...channelPayload,
          platformChannelId: page.id,
        });
        channelId = created.id;
      }

      try {
        console.log('[fb-connect] subscribing page to webhooks', {
          businessId,
          pageId: page.id,
          pageName: page.name,
        });
        await subscribeFacebookPageToWebhooks(page.id, page.access_token);
        console.log('[fb-connect] page subscribed', {
          businessId,
          pageId: page.id,
          channelId,
        });
      } catch (err) {
        console.error('[fb-connect] webhook subscription failed', {
          businessId,
          pageId: page.id,
          channelId,
          error: err instanceof Error ? err.message : String(err),
        });
        failed.push({
          pageId: page.id,
          error: err instanceof Error ? err.message : 'Webhook subscription failed',
        });
      }

      connected.push({ id: channelId, pageId: page.id, pageName: page.name });
    } catch (err) {
      console.error(`Facebook connect failed for page ${page.id}:`, err);
      failed.push({
        pageId: page.id,
        error: err instanceof Error ? err.message : 'Connect failed',
      });
    }
  }

  return c.json({ connected, skipped, failed });
});

export const facebookCallbackRouter = new OpenAPIHono();

facebookCallbackRouter.get('/auth/facebook/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('Missing code or state', 400);

  // Verify the signed state (issued by the authed fbAuthRoute) before trusting
  // the businessId it carries.
  const verified = await verifyOAuthState(state);
  if (!verified) return c.text('Invalid or expired state', 400);

  try {
    const userToken = await exchangeCodeForToken(code);
    const pages = await getUserPages(userToken);
    if (pages.length === 0) return c.text('No pages found', 400);

    const pagesToken = await createFacebookPagesSelectionToken({
      businessId: verified.businessId,
      userId: verified.userId,
      pages,
    });

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3400';
    return c.redirect(
      `${webUrl}/b/${verified.businessId}/channels/connect-facebook?token=${encodeURIComponent(pagesToken)}`,
    );
  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return c.text('OAuth failed', 500);
  }
});
