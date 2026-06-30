import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createPostInputSchema,
  updatePostInputSchema,
  postListItemSchema,
  postDetailSchema,
  generatePostInputSchema,
  tunePostInputSchema,
  publishPostOutputSchema,
  syncPostOutputSchema,
  errorSchema,
} from '@repo/shared';
import {
  createPost,
  getPostById,
  listPosts,
  updatePost,
  deletePost,
  insertPostSync,
} from '@repo/db/crud/post';
import { getProductById } from '@repo/db/crud/product';
import { getChannelById } from '@repo/db/crud/channel';
import { getPublisher } from '@repo/integrations';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const postsRouter = new OpenAPIHono();

postsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

// 1. List Posts
const listPostsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/posts',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: z.object({
      channelId: z.string().uuid().optional(),
      state: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(postListItemSchema) } },
      description: 'List of posts',
    },
  },
});

postsRouter.openapi(listPostsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const query = c.req.valid('query');
  const items = await listPosts(businessId, query);
  return c.json(
    items.map((item) => ({
      id: item.id,
      channelId: item.channelId,
      productId: item.productId,
      content: item.content,
      postState: item.postState,
      platformPostId: item.platformPostId,
      scheduledAt: item.scheduledAt?.toISOString() || null,
      publishedAt: item.publishedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
    })),
  );
});

// 2. Create Post
const createPostRoute = createRoute({
  method: 'post',
  path: '/{businessId}/posts',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createPostInputSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: postListItemSchema } },
      description: 'Post created',
    },
  },
});

postsRouter.openapi(createPostRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const body = c.req.valid('json');
  const created = await createPost(businessId, body.channelId, {
    content: body.content,
    mediaUrls: body.mediaUrls,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    productId: body.productId,
  });

  return c.json(
    {
      id: created.id,
      channelId: created.channelId,
      productId: created.productId,
      content: created.content,
      postState: created.postState,
      platformPostId: created.platformPostId,
      scheduledAt: created.scheduledAt?.toISOString() || null,
      publishedAt: created.publishedAt?.toISOString() || null,
      createdAt: created.createdAt.toISOString(),
    },
    201,
  );
});

// 3. Get Post
const getPostRoute = createRoute({
  method: 'get',
  path: '/{businessId}/posts/{postId}',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: postDetailSchema } },
      description: 'Post detail',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post not found',
    },
  },
});

postsRouter.openapi(getPostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const post = await getPostById(businessId, postId);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  const latestSync = post.syncs?.[0];

  return c.json({
    id: post.id,
    channelId: post.channelId,
    productId: post.productId,
    content: post.content,
    postState: post.postState,
    platformPostId: post.platformPostId,
    scheduledAt: post.scheduledAt?.toISOString() || null,
    publishedAt: post.publishedAt?.toISOString() || null,
    createdAt: post.createdAt.toISOString(),
    aiPrompt: post.aiPrompt,
    latestSync: latestSync
      ? {
          likeCount: latestSync.likeCount,
          commentCount: latestSync.commentCount,
          shareCount: latestSync.shareCount,
          reachCount: latestSync.reachCount,
          syncedAt: latestSync.syncedAt.toISOString(),
        }
      : null,
  });
});

// 4. Update Post
const updatePostRoute = createRoute({
  method: 'patch',
  path: '/{businessId}/posts/{postId}',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
    body: { content: { 'application/json': { schema: updatePostInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: postListItemSchema } },
      description: 'Post updated',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post not found',
    },
  },
});

postsRouter.openapi(updatePostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const body = c.req.valid('json');

  const updated = await updatePost(businessId, postId, {
    channelId: body.channelId,
    content: body.content,
    mediaUrls: body.mediaUrls,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : body.scheduledAt === null ? null : undefined,
    postState: body.postState,
    platformPostId: body.platformPostId,
    aiPrompt: body.aiPrompt,
  });

  if (!updated) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({
    id: updated.id,
    channelId: updated.channelId,
    productId: updated.productId,
    content: updated.content,
    postState: updated.postState,
    platformPostId: updated.platformPostId,
    scheduledAt: updated.scheduledAt?.toISOString() || null,
    publishedAt: updated.publishedAt?.toISOString() || null,
    createdAt: updated.createdAt.toISOString(),
  });
});

// 5. Delete Post
const deletePostRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/posts/{postId}',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ deleted: z.boolean() }) } },
      description: 'Post deleted',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post not found',
    },
  },
});

postsRouter.openapi(deletePostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const deleted = await deletePost(businessId, postId);
  if (!deleted) {
    return c.json({ error: 'Post not found' }, 404);
  }
  return c.json({ deleted: true });
});

// 6. Publish Post
const publishPostRoute = createRoute({
  method: 'post',
  path: '/{businessId}/posts/{postId}/publish',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: publishPostOutputSchema } },
      description: 'Post published',
    },
    400: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Invalid action or missing page token',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post or Channel not found',
    },
  },
});

postsRouter.openapi(publishPostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const post = await getPostById(businessId, postId);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  const channel = await getChannelById(post.channelId);
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  console.log(`[publish-post] postId=${postId} platform=${channel.platform} pageId=${channel.platformChannelId} contentLength=${post.content.length} mediaCount=${(post.mediaUrls ?? []).length}`);

  try {
    const publisher = getPublisher(channel.platform);
    const platformPostId = await publisher.publish(
      {
        apiToken: channel.apiToken,
        platformChannelId: channel.platformChannelId,
      },
      post.content,
      post.mediaUrls || undefined,
    );

    console.log(`[publish-post] SUCCESS platformPostId=${platformPostId}`);

    const publishedAt = new Date();
    await updatePost(businessId, postId, {
      postState: 'published',
      platformPostId,
      publishedAt,
    });

    return c.json({
      platformPostId,
      publishedAt: publishedAt.toISOString(),
    });
  } catch (err: any) {
    console.error(`[publish-post] FAILED postId=${postId} platform=${channel.platform}:`, err?.message ?? err);
    if (err?.cause) console.error('[publish-post] cause:', err.cause);
    await updatePost(businessId, postId, {
      postState: 'failed',
    });
    return c.json({ error: err.message || 'Publishing failed' }, 400);
  }
});

// 7. Sync Stats
const syncPostRoute = createRoute({
  method: 'post',
  path: '/{businessId}/posts/{postId}/sync',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: syncPostOutputSchema } },
      description: 'Post stats synced',
    },
    400: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post not published or missing platform ID',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post or Channel not found',
    },
  },
});

postsRouter.openapi(syncPostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const post = await getPostById(businessId, postId);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  if (!post.platformPostId) {
    return c.json({ error: 'Post must be published before syncing stats' }, 400);
  }

  const channel = await getChannelById(post.channelId);
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  try {
    const publisher = getPublisher(channel.platform);
    const stats = await publisher.syncStats(
      { apiToken: channel.apiToken },
      post.platformPostId,
    );

    const sync = await insertPostSync(post.id, stats);

    return c.json({
      likeCount: sync.likeCount,
      commentCount: sync.commentCount,
      shareCount: sync.shareCount,
      reachCount: sync.reachCount,
      syncedAt: sync.syncedAt.toISOString(),
    });
  } catch (err: any) {
    console.error(`[sync-post-route] error:`, err);
    return c.json({ error: err.message || 'Syncing stats failed' }, 400);
  }
});

// Helper: initialize LLM for post generation/tuning
function getLlm() {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-flash-lite-latest',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7,
  });
}

// 8. AI-Generate Draft from Product
const generatePostRoute = createRoute({
  method: 'post',
  path: '/{businessId}/posts/generate',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: generatePostInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: postListItemSchema } },
      description: 'Post draft generated',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Product or Channel not found',
    },
  },
});

postsRouter.openapi(generatePostRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { channelId, productId, tone } = c.req.valid('json');

  const product = await getProductById(businessId, productId);
  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  const channel = await getChannelById(channelId);
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }

  const prompt = `Write a highly engaging social media marketing post for the following product.
Product Name: ${product.name}
Price: $${product.price}
Description: ${product.description || 'No description available.'}
${tone ? `Desired Tone: ${tone}` : ''}

Make the post punchy, call-to-action oriented, and format it nicely with emojis. Do not output anything other than the post content.`;

  const llm = getLlm();
  const res = await llm.invoke([
    {
      role: 'system',
      content: 'You are a professional social media marketing copywriter.',
    },
    { role: 'user', content: prompt },
  ]);

  const content = String(res.content).trim();

  // Create the draft post in the database
  const created = await createPost(businessId, channelId, {
    content,
    productId,
  });

  return c.json({
    id: created.id,
    channelId: created.channelId,
    productId: created.productId,
    content: created.content,
    postState: created.postState,
    platformPostId: created.platformPostId,
    scheduledAt: created.scheduledAt?.toISOString() || null,
    publishedAt: created.publishedAt?.toISOString() || null,
    createdAt: created.createdAt.toISOString(),
  });
});

// 9. AI-Tune Existing Draft
const tunePostRoute = createRoute({
  method: 'post',
  path: '/{businessId}/posts/{postId}/tune',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      businessId: z.string().uuid(),
      postId: z.string().uuid(),
    }),
    body: { content: { 'application/json': { schema: tunePostInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: postListItemSchema } },
      description: 'Post draft tuned',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Post not found',
    },
  },
});

postsRouter.openapi(tunePostRoute, async (c) => {
  const { businessId, postId } = c.req.valid('param');
  const { instruction } = c.req.valid('json');

  const post = await getPostById(businessId, postId);
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  const prompt = `Here is the current draft of a social media post:
"""
${post.content}
"""

Please refine or rewrite this post according to the following instruction:
"${instruction}"

Output only the revised post content. Do not add any conversational text or wrapper quotes.`;

  const llm = getLlm();
  const res = await llm.invoke([
    {
      role: 'system',
      content: 'You are a professional social media marketing copywriter.',
    },
    { role: 'user', content: prompt },
  ]);

  const content = String(res.content).trim();

  // Save tuned draft
  const updated = await updatePost(businessId, postId, {
    content,
    aiPrompt: instruction,
  });

  return c.json({
    id: updated.id,
    channelId: updated.channelId,
    productId: updated.productId,
    content: updated.content,
    postState: updated.postState,
    platformPostId: updated.platformPostId,
    scheduledAt: updated.scheduledAt?.toISOString() || null,
    publishedAt: updated.publishedAt?.toISOString() || null,
    createdAt: updated.createdAt.toISOString(),
  });
});
