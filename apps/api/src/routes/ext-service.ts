import { OpenAPIHono } from '@hono/zod-openapi';
import {
  connectExternalChannelInputSchema,
  createExternalPostInputSchema,
  createExternalServiceInputSchema,
  createExternalServiceWebhookInputSchema,
  externalSenderActionInputSchema,
  externalServiceListQuerySchema,
  externalServiceSearchQuerySchema,
  getFacebookConnectOauthUrlInputSchema,
  sendExternalCommentReplyInputSchema,
  sendExternalMessageInputSchema,
  updateExternalPostInputSchema,
  updateExternalServiceInputSchema,
  updateExternalServiceWebhookInputSchema,
} from '@repo/shared';
import {
  ExternalChannelTakenError,
  ExternalServiceTakenError,
  createExternalService,
  createExternalServiceWebhook,
  createExternalServicePost,
  deleteExternalService,
  deleteExternalServicePost,
  deleteExternalServiceWebhook,
  deletePendingPage,
  getExternalService,
  getExternalServiceChannel,
  getExternalServicePost,
  getExternalServiceWebhook,
  getPendingPage,
  listExternalServices,
  pruneExpiredPendingPages,
  savePendingPage,
  searchExternalServices,
  updateExternalServicePost,
  updateExternalService,
  updateExternalServiceWebhook,
  upsertExternalServiceChannel,
} from '@repo/db/crud/external-service';
import {
  createOAuthState,
  deleteFacebookPost,
  getFacebookOAuthUrl,
  getFacebookPostComments,
  getFacebookPostDetails,
  getPageIdForToken,
  publishExternalPost,
  replyToFacebookComment,
  sendMediaMessage,
  sendMessage,
  senderAction,
  subscribeFacebookPageToWebhooks,
  updateFacebookPost,
  verifyFacebookPagesSelectionToken,
} from '@repo/integrations/facebook';

/**
 * External-service API. Mounted under `/api2` (and `/api`) so both the operator proxy and
 * the web app's rewrite expose it. Every route is stateless: the service id in the path is
 * the only tenant boundary.
 */
export const extServiceRouter = new OpenAPIHono();

type ServiceRow = {
  id: string;
  name: string;
  uniqueName: string;
  createdAt: Date;
  updatedAt: Date;
};

function serviceJson(row: ServiceRow) {
  return {
    id: row.id,
    name: row.name,
    uniqueName: row.uniqueName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function webhookJson(row: {
  id: string;
  serviceId: string;
  webhookUrl: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    url: row.webhookUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function badRequest(error: string, details?: unknown) {
  return { error, ...(details ? { details } : {}) };
}

// ── Service CRUD ─────────────────────────────────────────────────────────────

extServiceRouter.post('/ext-service/create', async (c) => {
  const parsed = createExternalServiceInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  try {
    const row = await createExternalService(parsed.data);
    return c.json(serviceJson(row), 201);
  } catch (err) {
    if (err instanceof ExternalServiceTakenError) return c.json(badRequest(err.message), 409);
    throw err;
  }
});

extServiceRouter.put('/ext-service/:id', async (c) => {
  const parsed = updateExternalServiceInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  try {
    const row = await updateExternalService(c.req.param('id'), parsed.data);
    if (!row) return c.json(badRequest('External service not found'), 404);
    return c.json(serviceJson(row), 200);
  } catch (err) {
    if (err instanceof ExternalServiceTakenError) return c.json(badRequest(err.message), 409);
    throw err;
  }
});

extServiceRouter.get('/ext-service/search', async (c) => {
  const parsed = externalServiceSearchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(badRequest('Invalid query', parsed.error.flatten()), 400);
  if (!parsed.data.id && !parsed.data.uname) {
    return c.json(badRequest('Pass id or uname'), 400);
  }
  const rows = await searchExternalServices(parsed.data);
  return c.json({ items: rows.map(serviceJson) }, 200);
});

extServiceRouter.get('/ext-service/all', async (c) => {
  const parsed = externalServiceListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(badRequest('Invalid query', parsed.error.flatten()), 400);
  const result = await listExternalServices(parsed.data.page, parsed.data.limit, parsed.data.since);
  return c.json({
    items: result.items.map(serviceJson),
    page: result.page,
    limit: result.limit,
    total: result.total,
  }, 200);
});

extServiceRouter.delete('/ext-service/:id', async (c) => {
  const result = await deleteExternalService(c.req.param('id'));
  if (!result) return c.json(badRequest('External service not found'), 404);
  return c.json(result, 200);
});

// ── Facebook OAuth ───────────────────────────────────────────────────────────

extServiceRouter.post('/ext-service/getFacebookConnectOauthUrl', async (c) => {
  const parsed = getFacebookConnectOauthUrlInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);

  const businessId = parsed.data.businessId ?? crypto.randomUUID();
  // The connector asks for the business and ads permissions the web flow exposes.
  const state = await createOAuthState({
    businessId,
    userId: 'ext-service',
    portfolio: true,
    ads: true,
    externalRedirectUrl: parsed.data.redirectUrl,
  });
  const url = getFacebookOAuthUrl(state, true, true);
  return c.json({ url, businessId }, 200);
});

/**
 * The external flow's landing page. Meta has already returned the Pages; this banks each
 * Page token (so `connectChannel` can redeem it by id) and posts the selected Page name + id
 * to the caller's redirect URL. No token ever leaves Oryxa.
 */
extServiceRouter.get('/ext-service/internal_facebook_url', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json(badRequest('Missing token'), 400);

  const verified = await verifyFacebookPagesSelectionToken(token);
  if (!verified || !verified.externalRedirectUrl) {
    return c.json(badRequest('Invalid or expired page selection token'), 400);
  }

  await pruneExpiredPendingPages();
  for (const page of verified.pages) {
    await savePendingPage({
      businessId: verified.businessId,
      pageId: page.id,
      pageName: page.name,
      accessToken: page.access_token,
      refreshToken: verified.adsToken ?? null,
    });
  }

  const posted: Array<{ pageId: string; pageName: string; status: number }> = [];
  const failed: Array<{ pageId: string; error: string }> = [];
  for (const page of verified.pages) {
    try {
      const res = await fetch(verified.externalRedirectUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessId: verified.businessId,
          pageName: page.name,
          pageId: page.id,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        posted.push({ pageId: page.id, pageName: page.name, status: res.status });
      } else {
        failed.push({ pageId: page.id, error: `redirect answered ${res.status}` });
      }
    } catch (err) {
      failed.push({ pageId: page.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return c.json({ businessId: verified.businessId, posted, failed }, 200);
});

extServiceRouter.post('/ext-service/:id/connectChannel', async (c) => {
  const parsed = connectExternalChannelInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;

  const service = await getExternalService(c.req.param('id'));
  if (!service) return c.json(badRequest('External service not found'), 404);

  let accessToken = data.accessToken;
  let refreshToken = data.refreshToken;
  let name = data.name;
  let pendingId: string | undefined;

  if (!accessToken) {
    const pending = await getPendingPage(data.pageId, data.businessId);
    if (!pending) {
      return c.json(
        badRequest('No pending Facebook token for that page — start the OAuth flow again'),
        400,
      );
    }
    accessToken = pending.accessToken;
    refreshToken = pending.refreshToken ?? undefined;
    name = name ?? pending.pageName;
    pendingId = pending.id;
  }

  if (data.platform === 'facebook') {
    const tokenPageId = await getPageIdForToken(accessToken);
    if (tokenPageId !== data.pageId) {
      return c.json(
        badRequest('The page token does not answer as this Page — reconnect and try again'),
        400,
      );
    }
  }

  try {
    const channel = await upsertExternalServiceChannel({
      serviceId: service.id,
      name: name ?? data.pageId,
      platform: data.platform,
      accessToken,
      refreshToken: refreshToken ?? null,
      platformChannelId: data.pageId,
    });
    if (!channel) return c.json(badRequest('External service not found'), 404);

    if (pendingId) await deletePendingPage(pendingId);

    let webhookSubscribed = false;
    if (data.platform === 'facebook') {
      try {
        await subscribeFacebookPageToWebhooks(data.pageId, accessToken);
        webhookSubscribed = true;
      } catch (err) {
        console.error('[ext-service] webhook subscription failed', {
          serviceId: service.id,
          pageId: data.pageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({
      id: channel.id,
      pageId: data.pageId,
      name: channel.name,
      platform: channel.platform,
      status: 'connected' as const,
      webhookSubscribed,
    }, 200);
  } catch (err) {
    if (err instanceof ExternalChannelTakenError) return c.json(badRequest(err.message), 409);
    throw err;
  }
});

// ── Webhooks ─────────────────────────────────────────────────────────────────

extServiceRouter.post('/ext-service/:id/webhook', async (c) => {
  const parsed = createExternalServiceWebhookInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const row = await createExternalServiceWebhook(c.req.param('id'), parsed.data.url);
  if (!row) return c.json(badRequest('External service not found'), 404);
  return c.json(webhookJson(row), 201);
});

extServiceRouter.get('/ext-service/:id/webhook/:webhookId', async (c) => {
  const row = await getExternalServiceWebhook(c.req.param('id'), c.req.param('webhookId'));
  if (!row) return c.json(badRequest('Webhook not found'), 404);
  return c.json(webhookJson(row), 200);
});

extServiceRouter.put('/ext-service/:id/webhook/:webhookId', async (c) => {
  const parsed = updateExternalServiceWebhookInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const row = await updateExternalServiceWebhook(
    c.req.param('id'),
    c.req.param('webhookId'),
    parsed.data.url,
  );
  if (!row) return c.json(badRequest('Webhook not found'), 404);
  return c.json(webhookJson(row), 200);
});

extServiceRouter.delete('/ext-service/:id/webhook/:webhookId', async (c) => {
  const result = await deleteExternalServiceWebhook(
    c.req.param('id'),
    c.req.param('webhookId'),
  );
  if (!result) return c.json(badRequest('Webhook not found'), 404);
  return c.json(result, 200);
});

// ── Posts ────────────────────────────────────────────────────────────────────

/** A stored post plus the channel whose token may call Meta for it. */
async function postWithChannel(serviceId: string, postId: string) {
  const post = await getExternalServicePost(serviceId, postId);
  if (!post) return null;
  // The DB platform enum is wider than the external-service platforms; every stored post here
  // was created through this router, so the value is always one of the four external platforms.
  const platform = post.platform as 'facebook' | 'instagram' | 'whatsapp' | 'telegram';
  const channel = await getExternalServiceChannel(serviceId, post.platformChannelId, platform);
  if (!channel) return null;
  return { post, channel };
}

function platformSupportsPosts(platform: string): boolean {
  // Only Facebook has a post publisher registered; Instagram/WhatsApp/Telegram do not.
  return platform === 'facebook';
}

extServiceRouter.post('/ext-service/:id/post', async (c) => {
  const parsed = createExternalPostInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;
  if (!platformSupportsPosts(data.platform)) {
    return c.json(badRequest('Post publishing is only supported for facebook'), 400);
  }

  const channel = await getExternalServiceChannel(c.req.param('id'), data.pageId, data.platform);
  if (!channel) return c.json(badRequest('Channel not found for that page'), 404);

  try {
    const postId = await publishExternalPost(
      channel.accessToken,
      data.pageId,
      data.postContent.text ?? '',
      data.postContent.media ?? [],
    );
    await createExternalServicePost({
      serviceId: c.req.param('id'),
      channelId: channel.id,
      platform: data.platform,
      platformPostId: postId,
      platformChannelId: data.pageId,
      text: data.postContent.text ?? null,
      media: data.postContent.media ?? [],
    });
    return c.json({ postId, id: postId, status: 'created' as const }, 201);
  } catch (err) {
    return c.json(
      badRequest(err instanceof Error ? err.message : 'Post publishing failed'),
      502,
    );
  }
});

extServiceRouter.get('/ext-service/:id/post/:postId', async (c) => {
  const found = await postWithChannel(c.req.param('id'), c.req.param('postId'));
  if (!found) return c.json(badRequest('Post not found'), 404);
  if (!platformSupportsPosts(found.post.platform)) {
    return c.json(badRequest('Post reading is only supported for facebook'), 400);
  }

  try {
    const details = await getFacebookPostDetails(found.channel.accessToken, found.post.platformPostId);
    return c.json({
      id: found.post.platformPostId,
      platform: found.post.platform,
      pageId: found.post.platformChannelId,
      text: details.text,
      media: details.media,
      createdAt: details.createdAt,
      permalinkUrl: details.permalinkUrl,
      stats: details.stats,
    }, 200);
  } catch (err) {
    return c.json(badRequest(err instanceof Error ? err.message : 'Post read failed'), 502);
  }
});

extServiceRouter.get('/ext-service/:id/post/:postId/comment', async (c) => {
  const found = await postWithChannel(c.req.param('id'), c.req.param('postId'));
  if (!found) return c.json(badRequest('Post not found'), 404);
  if (!platformSupportsPosts(found.post.platform)) {
    return c.json(badRequest('Comment reading is only supported for facebook'), 400);
  }

  try {
    const comments = await getFacebookPostComments(found.channel.accessToken, found.post.platformPostId);
    return c.json({ comments }, 200);
  } catch (err) {
    return c.json(badRequest(err instanceof Error ? err.message : 'Comment read failed'), 502);
  }
});

extServiceRouter.put('/ext-service/:id/post/:postId', async (c) => {
  const parsed = updateExternalPostInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const found = await postWithChannel(c.req.param('id'), c.req.param('postId'));
  if (!found) return c.json(badRequest('Post not found'), 404);
  if (!platformSupportsPosts(found.post.platform)) {
    return c.json(badRequest('Post updating is only supported for facebook'), 400);
  }

  try {
    await updateFacebookPost(found.channel.accessToken, found.post.platformPostId, parsed.data.text);
  } catch (err) {
    return c.json(badRequest(err instanceof Error ? err.message : 'Post update failed'), 502);
  }
  const updated = await updateExternalServicePost(
    c.req.param('id'),
    c.req.param('postId'),
    parsed.data.text,
  );
  return c.json({ postId: c.req.param('postId'), updated: true, text: updated?.text ?? parsed.data.text }, 200);
});

extServiceRouter.delete('/ext-service/:id/post/:postId', async (c) => {
  const found = await postWithChannel(c.req.param('id'), c.req.param('postId'));
  if (!found) return c.json(badRequest('Post not found'), 404);
  if (!platformSupportsPosts(found.post.platform)) {
    return c.json(badRequest('Post deleting is only supported for facebook'), 400);
  }

  try {
    await deleteFacebookPost(found.channel.accessToken, found.post.platformPostId);
  } catch (err) {
    return c.json(badRequest(err instanceof Error ? err.message : 'Post delete failed'), 502);
  }
  const result = await deleteExternalServicePost(c.req.param('id'), c.req.param('postId'));
  if (!result) return c.json(badRequest('Post not found'), 404);
  return c.json(result, 200);
});

// ── Sending ──────────────────────────────────────────────────────────────────

function messagingPlatform(platform: string): 'facebook' | 'instagram' | null {
  return platform === 'facebook' || platform === 'instagram' ? platform : null;
}

extServiceRouter.post('/ext-service/:id/SendMessage', async (c) => {
  const parsed = sendExternalMessageInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;
  if (!data.message && !data.mediaUrl) {
    return c.json(badRequest('Pass message or mediaUrl'), 400);
  }
  const platform = messagingPlatform(data.platformType);
  if (!platform) return c.json(badRequest('Sending is only supported for facebook and instagram'), 400);

  const channel = await getExternalServiceChannel(c.req.param('id'), data.pageId, data.platformType);
  if (!channel) return c.json(badRequest('Channel not found for that page'), 404);

  if (data.mediaUrl) {
    await sendMediaMessage(channel.accessToken, data.recipientId, data.mediaUrl, data.mediaType ?? 'image');
  } else {
    await sendMessage(channel.accessToken, data.recipientId, data.message!, { platform });
  }
  return c.json({ sent: true }, 200);
});

extServiceRouter.post('/ext-service/:id/sendCommentReply', async (c) => {
  const parsed = sendExternalCommentReplyInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;
  if (!messagingPlatform(data.platformType)) {
    return c.json(badRequest('Comment replies are only supported for facebook and instagram'), 400);
  }

  const channel = await getExternalServiceChannel(c.req.param('id'), data.pageId, data.platformType);
  if (!channel) return c.json(badRequest('Channel not found for that page'), 404);

  const replyId = await replyToFacebookComment(channel.accessToken, data.commentId, data.message);
  return c.json({ replied: true, commentId: data.commentId, replyId }, 200);
});

extServiceRouter.post('/ext-service/:id/SendMessageSeenReq', async (c) => {
  const parsed = externalSenderActionInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;
  if (!messagingPlatform(data.platformType)) {
    return c.json(badRequest('Seen receipts are only supported for facebook and instagram'), 400);
  }
  const channel = await getExternalServiceChannel(c.req.param('id'), data.pageId, data.platformType);
  if (!channel) return c.json(badRequest('Channel not found for that page'), 404);
  await senderAction(channel.accessToken, data.recipientId, 'mark_seen');
  return c.json({ sent: true }, 200);
});

extServiceRouter.post('/ext-service/:id/SendMessageTypingReq', async (c) => {
  const parsed = externalSenderActionInputSchema.safeParse(await jsonBody(c));
  if (!parsed.success) return c.json(badRequest('Invalid body', parsed.error.flatten()), 400);
  const data = parsed.data;
  if (!messagingPlatform(data.platformType)) {
    return c.json(badRequest('Typing indicators are only supported for facebook and instagram'), 400);
  }
  const channel = await getExternalServiceChannel(c.req.param('id'), data.pageId, data.platformType);
  if (!channel) return c.json(badRequest('Channel not found for that page'), 404);
  await senderAction(channel.accessToken, data.recipientId, 'typing_on');
  return c.json({ sent: true }, 200);
});

// ── Service read ─────────────────────────────────────────────────────────────

/**
 * Registered last on purpose: `:id` would otherwise swallow the static GET paths
 * (`/search`, `/all`, `/internal_facebook_url`), because Hono matches in registration order.
 */
extServiceRouter.get('/ext-service/:id', async (c) => {
  const row = await getExternalService(c.req.param('id'));
  if (!row) return c.json(badRequest('External service not found'), 404);
  return c.json(serviceJson(row), 200);
});
