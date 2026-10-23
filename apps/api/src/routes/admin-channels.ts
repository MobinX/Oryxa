import { OpenAPIHono } from '@hono/zod-openapi';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import { safeReturnOrigin } from '@api/lib/return-origin';
import {
  ChannelTakenError,
  getLiveChannelOwner,
  listAdminChannels,
  upsertAdminChannel,
} from '@repo/db/crud/channel';
import {
  ADMIN_FACEBOOK_FLOW,
  createOAuthState,
  getFacebookOAuthUrl,
  getPageIdForToken,
  subscribeFacebookPageToWebhooks,
  verifyFacebookPagesSelectionToken,
} from '@repo/integrations/facebook';

/**
 * The operator's own Pages. Same OAuth handshake as a merchant's connect flow, but the channel
 * it creates belongs to nobody: `businessId` is null and `isAdminOnly` is true, so its DMs are
 * read as notification codes and never start an agent.
 */
export const adminChannelsRouter = new OpenAPIHono();

adminChannelsRouter.use('/admin/channels', logsAuthMiddleware);
adminChannelsRouter.use('/admin/channels/*', logsAuthMiddleware);

adminChannelsRouter.get('/admin/channels', async (c) => {
  const rows = await listAdminChannels();
  return c.json({
    channels: rows.map((row) => {
      let pageName = row.platformChannelId;
      try {
        const extra = JSON.parse(row.extraInfo ?? '{}') as { pageName?: string };
        pageName = extra.pageName ?? pageName;
      } catch {
        // A row written before pageName lived in extraInfo keeps its id as the label.
      }
      return {
        id: row.id,
        pageId: row.platformChannelId,
        pageName,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  });
});

adminChannelsRouter.get('/admin/channels/facebook/auth', async (c) => {
  const state = await createOAuthState({
    businessId: ADMIN_FACEBOOK_FLOW,
    userId: 'operator',
    returnOrigin: safeReturnOrigin(c.req.query('returnOrigin')),
  });
  return c.json({ url: getFacebookOAuthUrl(state) });
});

adminChannelsRouter.get('/admin/channels/facebook/pending', async (c) => {
  const verified = await verifyFacebookPagesSelectionToken(c.req.query('token'));
  if (!verified || verified.businessId !== ADMIN_FACEBOOK_FLOW) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }

  const pages = await Promise.all(
    verified.pages.map(async (page) => {
      const owner = await getLiveChannelOwner('facebook', page.id);
      return {
        id: page.id,
        name: page.name,
        connected: owner?.isAdminOnly === true,
        heldByStore: Boolean(owner && !owner.isAdminOnly),
      };
    }),
  );
  return c.json({ pages });
});

adminChannelsRouter.post('/admin/channels/facebook/connect', async (c) => {
  let body: { token?: string; pageIds?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const verified = await verifyFacebookPagesSelectionToken(body.token);
  if (!verified || verified.businessId !== ADMIN_FACEBOOK_FLOW) {
    return c.json({ error: 'Invalid or expired page selection token' }, 400);
  }
  const pageIds = Array.isArray(body.pageIds)
    ? body.pageIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (pageIds.length === 0) return c.json({ error: 'Choose at least one Page' }, 400);

  const pageById = new Map(verified.pages.map((page) => [page.id, page]));
  const connected: Array<{ id: string; pageId: string; pageName: string }> = [];
  const failed: Array<{ pageId: string; error: string }> = [];

  for (const pageId of pageIds) {
    const page = pageById.get(pageId);
    if (!page) {
      failed.push({ pageId, error: 'That Page is not part of this selection' });
      continue;
    }
    try {
      // The stored token is what sends and unsubscribes act with, so it must belong to this Page.
      const tokenPageId = await getPageIdForToken(page.access_token);
      if (tokenPageId !== page.id) {
        failed.push({
          pageId: page.id,
          error: 'The Page token Facebook handed over does not match this Page — reconnect and try again',
        });
        continue;
      }

      const channel = await upsertAdminChannel({
        platformChannelId: page.id,
        apiToken: page.access_token,
        pageName: page.name,
      });

      try {
        await subscribeFacebookPageToWebhooks(page.id, page.access_token);
      } catch (err) {
        failed.push({
          pageId: page.id,
          error: err instanceof Error ? err.message : 'Webhook subscription failed',
        });
        continue;
      }

      connected.push({ id: channel.id, pageId: page.id, pageName: page.name });
    } catch (err) {
      failed.push({
        pageId: page.id,
        error:
          err instanceof ChannelTakenError
            ? 'This Page answers a store already; disconnect it there first'
            : err instanceof Error
              ? err.message
              : 'Connect failed',
      });
    }
  }

  return c.json({ connected, failed });
});
