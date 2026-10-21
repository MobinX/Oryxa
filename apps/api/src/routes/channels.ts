import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createAgentInputSchema,
  createAgentOutputSchema,
  selectAgentSchema,
  agentGuidanceDefaultsSchema,
  updateAgentInputSchema,
  updateAgentOutputSchema,
  deleteAgentOutputSchema,
  createChannelInputSchema,
  createChannelOutputSchema,
  updateChannelInputSchema,
  updateChannelOutputSchema,
  deleteChannelOutputSchema,
  facebookAuthQuerySchema,
  facebookPendingPagesQuerySchema,
  facebookPendingPageSchema,
  facebookConnectPagesInputSchema,
  facebookConnectPagesOutputSchema,
  instagramPendingAccountSchema,
  instagramConnectAccountsInputSchema,
  instagramConnectAccountsOutputSchema,
} from '@repo/shared';
import { COMMENT_REPLY_GUIDANCE, DEFAULT_REPLY_GUIDANCE } from '@repo/agent';
import {
  createAgent,
  getAgentById,
  listAgents,
  updateAgent,
  deleteAgent,
  createChannel,
  listChannels,
  updateChannel,
  deleteChannel,
  getChannelById,
  getLiveChannelOwnerBusinessId,
  findChannelByBusinessPlatformChannelId,
  reactivateChannel,
  ChannelTakenError,
  ChannelAgentError,
} from '@repo/db/crud/channel';
import { ensureDefaultAgent, getPlatformAgent, resolveAnsweringAgent } from '@repo/db/crud/default-agent';
import {
  ADMIN_FACEBOOK_FLOW,
  getFacebookOAuthUrl,
  exchangeCodeForToken,
  getUserPages,
  createOAuthState,
  verifyOAuthState,
  createFacebookPagesSelectionToken,
  verifyFacebookPagesSelectionToken,
  subscribeFacebookPageToWebhooks,
  unsubscribeFacebookPageFromWebhooks,
  getPageIdForToken,
  getGrantedPermissions,
  getPortfolioPages,
  type FacebookPageOption,
  type PortfolioPage,
} from '@repo/integrations/facebook';
import {
  getInstagramOAuthUrl,
  getInstagramAccountForPage,
  subscribeInstagramPageToWebhooks,
} from '@repo/integrations/instagram';
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

const getDefaultAgentRoute = createRoute({
  method: 'get',
  path: '/{businessId}/agents/default',
  tags: ['Agents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: selectAgentSchema.extend({ guidanceDefaults: agentGuidanceDefaultsSchema }),
        },
      },
      description: 'The agent answering this store, with the wording it falls back to',
    },
  },
});

/**
 * The single agent a store's channels answer with. Created on the spot if the store predates the
 * default, which is why the playground can always show a prompt instead of an empty editor.
 *
 * `guidanceDefaults` travels with it because the two guidance boxes are empty whenever a store has
 * not written its own — and an editor that shows nothing would be an editor showing a lie. The
 * built-in text is what the agent actually gets, so the playground shows it as the placeholder.
 */
channelsRouter.openapi(getDefaultAgentRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const agent = await ensureDefaultAgent(businessId);
  // The editor shows what this store ACTUALLY answers with — its own row when it wrote one, the platform
  // default otherwise — while the id stays the store's row, because that is where saving must land.
  const answering = await resolveAnsweringAgent(agent);
  const platform = await getPlatformAgent();
  return c.json({
    id: agent.id,
    name: agent.name,
    platformType: agent.platformType,
    systemPrompt: answering.systemPrompt,
    replyGuidance: answering.replyGuidance,
    commentReplyGuidance: answering.commentReplyGuidance,
    followsDefault: agent.followsDefault !== false,
    createdAt: agent.createdAt.toISOString(),
    guidanceDefaults: {
      replyGuidance: platform.replyGuidance ?? DEFAULT_REPLY_GUIDANCE,
      commentReplyGuidance: platform.commentReplyGuidance ?? COMMENT_REPLY_GUIDANCE,
    },
  });
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
    409: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Already connected to another store' },
  },
});

channelsRouter.openapi(createChannelRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  try {
    // The store's default agent, whatever the caller asked for: choosing which agent answers a
    // Page was the part of this product that merchants got wrong, so it is no longer a decision.
    const agent = await ensureDefaultAgent(businessId);
    const channel = await createChannel(businessId, { ...data, agentId: agent.id });
    return c.json(channel, 201);
  } catch (err) {
    if (err instanceof ChannelTakenError) return c.json({ error: err.message }, 409);
    if (err instanceof ChannelAgentError) return c.json({ error: err.message }, 400);
    throw err;
  }
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
    409: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Already connected to another store' },
  },
});

channelsRouter.openapi(updateChannelRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channelId = c.req.param('channelId');
  const data = c.req.valid('json');
  try {
    const agent = await ensureDefaultAgent(businessId);
    const result = await updateChannel(businessId, channelId, { ...data, agentId: agent.id });
    if (!result) return c.json({ error: 'Channel not found' }, 404);
    return c.json(result);
  } catch (err) {
    if (err instanceof ChannelTakenError) return c.json({ error: err.message }, 409);
    if (err instanceof ChannelAgentError) return c.json({ error: err.message }, 400);
    throw err;
  }
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

  // Fetch the channel first to access apiToken for webhook unsubscription
  const channelRow = await getChannelById(channelId);
  if (!channelRow || channelRow.businessId !== businessId) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  if (channelRow?.platform === 'facebook' && channelRow.apiToken) {
    try {
      // Meta resolves subscribed_apps by the token's own page, not by the id in the path — an
      // unsubscribe with a stale or mismatched token would silently disconnect whichever page
      // that token answers as. So the token names this channel's page before it may unsubscribe.
      const tokenPageId = await getPageIdForToken(channelRow.apiToken);
      if (tokenPageId !== channelRow.platformChannelId) {
        console.warn('[delete-channel] webhook unsubscribe skipped — the stored token answers as a different page', {
          channelId,
          pageId: channelRow.platformChannelId,
          tokenPageId: tokenPageId ?? 'invalid token',
        });
      } else {
        await unsubscribeFacebookPageFromWebhooks(channelRow.platformChannelId, channelRow.apiToken);
        console.log('[delete-channel] unsubscribed page from webhooks', { channelId, pageId: channelRow.platformChannelId });
      }
    } catch (err) {
      // Log but don't block deletion — page token may have expired
      console.warn('[delete-channel] webhook unsubscription failed (continuing with delete)', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (channelRow?.platform === 'instagram' && channelRow.apiToken) {
    // Instagram rides the linked Page's subscription. Unsubscribing that Page stops the
    // Page's own Messenger delivery too, so it only happens when no other live channel
    // of this store still answers through the same Page.
    try {
      const info = channelRow.extraInfo
        ? (JSON.parse(channelRow.extraInfo) as { pageId?: string })
        : {};
      if (info.pageId) {
        const siblings = await listChannels(businessId);
        const pageStillInUse = siblings.some((other) => {
          if (other.id === channelId) return false;
          if (other.platform === 'facebook') return other.platformChannelId === info.pageId;
          if (other.platform === 'instagram') {
            try {
              return (
                (JSON.parse(other.extraInfo ?? '{}') as { pageId?: string }).pageId === info.pageId
              );
            } catch {
              return false;
            }
          }
          return false;
        });
        if (pageStillInUse) {
          console.log('[delete-channel] Instagram page subscription kept — another channel uses it', {
            channelId,
            pageId: info.pageId,
          });
        } else {
          await unsubscribeFacebookPageFromWebhooks(info.pageId, channelRow.apiToken);
          console.log('[delete-channel] unsubscribed Instagram page from webhooks', {
            channelId,
            pageId: info.pageId,
          });
        }
      }
    } catch (err) {
      console.warn('[delete-channel] Instagram webhook unsubscription failed (continuing)', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: facebookAuthQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ url: z.string() }) } }, description: 'OAuth URL' },
  },
});

channelsRouter.openapi(fbAuthRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const { portfolio } = c.req.valid('query');
  // Meta echoes `state` back verbatim, so the user's answer survives the round trip inside
  // the same signed token that binds the flow to this business — no second token, and a
  // client cannot relabel someone else's flow as portfolio-aware.
  const choice = portfolio === undefined ? undefined : portfolio === 'true';
  // state is a signed, short-lived token bound to this user + business, so the
  // OAuth callback can't be replayed to attach a page to a business the caller
  // doesn't own.
  const state = await createOAuthState({ businessId, userId: user.id, portfolio: choice });
  const url = getFacebookOAuthUrl(state, choice);
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
      // The holder may be another store. Saying so is what the merchant needs; naming that store
      // is not, so only "is it mine" survives the boundary.
      const ownerId = await getLiveChannelOwnerBusinessId('facebook', page.id);
      return {
        id: page.id,
        name: page.name,
        connected: ownerId === businessId,
        heldByOtherStore: !!ownerId && ownerId !== businessId,
        business: page.business ?? null,
      };
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

  // Every Page this store connects answers with the store's default agent — there is nothing to
  // pick any more, so the agent is resolved once for the whole batch.
  const defaultAgent = await ensureDefaultAgent(businessId);

  for (const pageId of pageIds) {
    const page = pageById.get(pageId);
    if (!page) {
      skipped.push(pageId);
      continue;
    }

    // The stored token is what sends and unsubscribes act with for this page, so it has to
    // answer as the page it is stored under. Meta resolves subscribed_apps by the token, not
    // by the path — a mismatched token would mean a channel that cannot reply and whose
    // deletion unsubscribes a different page. Refuse the page instead of storing that.
    const tokenPageId = await getPageIdForToken(page.access_token);
    if (tokenPageId !== page.id) {
      failed.push({
        pageId: page.id,
        error: 'The page token Facebook handed over does not match this page — reconnect and try again',
      });
      continue;
    }

    const channelPayload = {
      apiToken: page.access_token,
      agentId: defaultAgent.id,
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

// Instagram OAuth — the same Facebook Login, with the Instagram permissions and picker.
const igAuthRoute = createRoute({
  method: 'get',
  path: '/{businessId}/channels/instagram/auth',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ url: z.string() }) } }, description: 'OAuth URL' },
  },
});

channelsRouter.openapi(igAuthRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const portfolio = process.env.META_BUSINESS_MANAGEMENT === 'true';
  const state = await createOAuthState({
    businessId,
    userId: user.id,
    platform: 'instagram',
    // Same deployment switch as the Page flow: portfolio Pages are merged only when the app has
    // been granted `business_management`, because asking for an unapproved scope fails the login.
    portfolio,
  });
  return c.json({ url: getInstagramOAuthUrl(state, portfolio) });
});

const igPendingAccountsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/channels/instagram/pending',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: facebookPendingPagesQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(instagramPendingAccountSchema) } },
      description: 'Instagram accounts available to connect after OAuth',
    },
    400: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid token' },
  },
});

channelsRouter.openapi(igPendingAccountsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const { token } = c.req.valid('query');
  const verified = await verifyFacebookPagesSelectionToken(token);
  if (
    !verified ||
    verified.businessId !== businessId ||
    verified.userId !== user.id ||
    verified.platform !== 'instagram'
  ) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }

  const accounts = verified.pages.flatMap((page) =>
    page.instagram ? [{ page, account: page.instagram }] : [],
  );
  const rows = await Promise.all(
    accounts.map(async ({ page, account }) => {
      const ownerId = await getLiveChannelOwnerBusinessId('instagram', account.id);
      return {
        id: account.id,
        username: account.username,
        name: account.name ?? null,
        profilePic: account.profilePic ?? null,
        pageId: page.id,
        pageName: page.name,
        connected: ownerId === businessId,
        heldByOtherStore: !!ownerId && ownerId !== businessId,
      };
    }),
  );
  return c.json(rows);
});

const igConnectAccountsRoute = createRoute({
  method: 'post',
  path: '/{businessId}/channels/instagram/connect',
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: instagramConnectAccountsInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: instagramConnectAccountsOutputSchema } },
      description: 'Selected Instagram accounts linked',
    },
    400: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid request' },
  },
});

channelsRouter.openapi(igConnectAccountsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const { token, accountIds } = c.req.valid('json');
  const verified = await verifyFacebookPagesSelectionToken(token);
  if (
    !verified ||
    verified.businessId !== businessId ||
    verified.userId !== user.id ||
    verified.platform !== 'instagram'
  ) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }

  const byAccountId = new Map(
    verified.pages.flatMap((page) =>
      page.instagram ? [[page.instagram.id, { page, account: page.instagram }] as const] : [],
    ),
  );
  const connected: Array<{ id: string; instagramId: string; username: string }> = [];
  const skipped: string[] = [];
  const failed: Array<{ instagramId: string; error: string }> = [];
  const defaultAgent = await ensureDefaultAgent(businessId);

  for (const accountId of accountIds) {
    const entry = byAccountId.get(accountId);
    if (!entry) {
      skipped.push(accountId);
      continue;
    }
    const { page, account } = entry;

    // The token has to still answer for this Page, and the Page has to still name the
    // same professional account: the signed selection is minutes old, but a token can
    // be revoked and an account can be unlinked in between.
    const liveAccount = await getInstagramAccountForPage(page.id, page.access_token);
    if (liveAccount?.id !== account.id) {
      failed.push({
        instagramId: account.id,
        error:
          'This Instagram account is no longer linked to the Page, or the Instagram permissions were not granted. Reconnect and try again.',
      });
      continue;
    }

    const handle = `@${account.username}`;
    const channelPayload = {
      apiToken: page.access_token,
      agentId: defaultAgent.id,
      extraInfo: JSON.stringify({
        pageName: handle,
        username: account.username,
        instagramName: account.name ?? null,
        profilePic: account.profilePic ?? null,
        pageId: page.id,
        facebookPageName: page.name,
      }),
    };

    try {
      const existing = await findChannelByBusinessPlatformChannelId(
        businessId,
        'instagram',
        account.id,
      );
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
          platform: 'instagram',
          ...channelPayload,
          platformChannelId: account.id,
        });
        channelId = created.id;
      }

      try {
        await subscribeInstagramPageToWebhooks(page.id, page.access_token);
      } catch (err) {
        console.error('[ig-connect] webhook subscription failed', {
          businessId,
          instagramId: account.id,
          pageId: page.id,
          error: err instanceof Error ? err.message : String(err),
        });
        failed.push({
          instagramId: account.id,
          error: err instanceof Error ? err.message : 'Webhook subscription failed',
        });
      }

      connected.push({ id: channelId, instagramId: account.id, username: account.username });
    } catch (err) {
      console.error(`Instagram connect failed for account ${account.id}:`, err);
      failed.push({
        instagramId: account.id,
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

  // Verify the signed state (issued by the authed fbAuthRoute) before trusting the
  // businessId it carries.
  const verified = await verifyOAuthState(state);
  if (!verified) return c.text('Invalid or expired state', 400);

  const webUrl = process.env.WEB_URL ?? 'http://localhost:3400';
  const platform = verified.platform;
  // The same signed flow serves the admin console: only the picker's home changes. Instagram
  // has its own picker because it shows accounts rather than Pages.
  const adminFlow = platform === 'facebook' && verified.businessId === ADMIN_FACEBOOK_FLOW;
  const pickerUrl =
    platform === 'instagram'
      ? `${webUrl}/b/${verified.businessId}/channels/connect-instagram`
      : adminFlow
        ? `${webUrl}/admin/channels/connect-facebook`
        : `${webUrl}/b/${verified.businessId}/channels/connect-facebook`;
  const toPicker = async (pages: FacebookPageOption[]) => {
    const pagesToken = await createFacebookPagesSelectionToken({
      businessId: verified.businessId,
      userId: verified.userId,
      pages,
      platform,
    });
    return c.redirect(`${pickerUrl}?token=${encodeURIComponent(pagesToken)}`);
  };

  const toError = (error: string, detail?: string) =>
    c.redirect(
      `${pickerUrl}?error=${error}${
        detail ? `&detail=${encodeURIComponent(detail)}` : ''
      }`,
    );

  try {
    const userToken = await exchangeCodeForToken(code);
    let pages = await getUserPages(userToken);
    console.log('[fb-callback] /me/accounts returned pages', {
      businessId: verified.businessId,
      platform,
      count: pages.length,
    });

    if (verified.portfolio) {
      const combined = await withPortfolioPages(pages, userToken);
      console.log('[fb-callback] portfolio lookup added pages', {
        businessId: verified.businessId,
        added: combined.length - pages.length,
      });
      pages = combined;
    }

    if (platform === 'instagram') {
      const accounts = await withInstagramAccounts(pages);
      console.log('[fb-callback] pages linked to Instagram accounts', {
        businessId: verified.businessId,
        pages: pages.length,
        accounts: accounts.length,
      });
      if (accounts.length > 0) return await toPicker(accounts);
      return toError(
        'no-instagram-account',
        'None of the Pages on this account is linked to an Instagram professional account',
      );
    }

    if (pages.length > 0) {
      return await toPicker(pages);
    }

    const outcome = await diagnoseEmptyPageList(userToken);
    if (Array.isArray(outcome)) return await toPicker(outcome);
    return toError(outcome.error, outcome.detail);
  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return c.text('OAuth failed', 500);
  }
});

/**
 * Keeps only the Pages that name a linked Instagram professional account, keeping each
 * Page's token so the picker can connect without asking Meta again. Bounded on purpose:
 * the lookup runs inline in the OAuth redirect, and an account with hundreds of Pages
 * still has to come back quickly.
 */
const INSTAGRAM_PAGE_LOOKUP_LIMIT = 25;

async function withInstagramAccounts(
  pages: FacebookPageOption[],
): Promise<FacebookPageOption[]> {
  const candidates = pages.filter((page) => page.access_token).slice(0, INSTAGRAM_PAGE_LOOKUP_LIMIT);
  const linked = await Promise.all(
    candidates.map(async (page) => {
      const instagram = await getInstagramAccountForPage(page.id, page.access_token);
      return instagram ? { ...page, instagram } : null;
    }),
  );
  return linked.flatMap((page) => (page === null ? [] : [page]));
}

/**
 * Someone who said "my Pages are in a business portfolio" expects both lists in one picker:
 * portfolio-admin Pages also show up in `/me/accounts`, so the personal list is kept and the
 * portfolio Pages are appended behind it. Pages Meta handed no token for are left out here —
 * `api_token` is NOT NULL, so there is nothing to store for them.
 */
async function withPortfolioPages(
  pages: FacebookPageOption[],
  userToken: string,
): Promise<FacebookPageOption[]> {
  let portfolioPages: PortfolioPage[];
  try {
    portfolioPages = await getPortfolioPages(userToken);
  } catch (err) {
    console.warn('[fb-callback] portfolio lookup failed', { error: String(err) });
    return pages;
  }

  const seen = new Set(pages.map((page) => page.id));
  const merged = [...pages];
  for (const page of portfolioPages) {
    if (!page.accessToken || seen.has(page.id)) continue;
    seen.add(page.id);
    merged.push(toPortfolioPageOption(page));
  }
  return merged;
}

function toPortfolioPageOption(page: PortfolioPage): FacebookPageOption {
  return {
    id: page.id,
    name: page.name,
    access_token: page.accessToken as string,
    business: page.businessName,
  };
}

type PageListDiagnosis = { error: string; detail?: string };

/**
 * `/me/accounts` answers 200 with an empty list for more than one reason, and the flow used
 * to call every one of them "you didn't select any Pages" — advice the user cannot act on.
 * Ask Meta instead: Pages that exist only inside a Business Portfolio are returned here so
 * the picker can offer them, and the remaining cases are named separately so the screen can
 * say whose problem it is. Best-effort throughout — a diagnosis that fails must still be a
 * redirect, never a 500 on the way back from Facebook.
 */
async function diagnoseEmptyPageList(
  userToken: string,
): Promise<FacebookPageOption[] | PageListDiagnosis> {
  const [permissions, portfolioPages] = await Promise.all([
    getGrantedPermissions(userToken)
      .then((granted) => granted as string[] | null)
      .catch((err) => {
        console.warn('[fb-callback] permission lookup failed', { error: String(err) });
        return null;
      }),
    getPortfolioPages(userToken)
      .then((pages) => pages as PortfolioPage[])
      .catch((err) => {
        console.warn('[fb-callback] portfolio lookup failed', { error: String(err) });
        return [] as PortfolioPage[];
      }),
  ]);

  const connectable = portfolioPages
    .filter((page) => !!page.accessToken)
    .map(toPortfolioPageOption);

  if (connectable.length > 0) return connectable;

  if (portfolioPages.length > 0) {
    return {
      error: 'pages-not-controllable',
      detail: portfolioPages
        .slice(0, 3)
        .map((page) => `${page.name} — ${page.businessName}`)
        .join('; '),
    };
  }
  // A failed lookup is not evidence the permission was withheld, so it must not be reported
  // as if it were — only a `pages_show_list` Meta actually answered without can say that.
  if (permissions !== null && !permissions.includes('pages_show_list')) {
    return { error: 'pages-permission-not-granted' };
  }
  return { error: 'no-pages-on-account' };
}
