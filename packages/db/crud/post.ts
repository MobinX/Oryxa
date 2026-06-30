import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { posts, postSyncs } from '@db/schema';

export async function createPost(
  businessId: string,
  channelId: string,
  data: {
    content?: string;
    mediaUrls?: string[] | null;
    scheduledAt?: Date | string | null;
    productId?: string | null;
  },
) {
  const [created] = await db
    .insert(posts)
    .values({
      businessId,
      channelId,
      productId: data.productId || null,
      content: data.content ?? '',
      mediaUrls: data.mediaUrls || null,
      postState: data.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    })
    .returning();

  return created;
}

export async function getPostById(businessId: string, postId: string) {
  return db.query.posts.findFirst({
    where: and(
      eq(posts.id, postId),
      eq(posts.businessId, businessId),
      isNull(posts.deletedAt),
    ),
    with: {
      channel: true,
      product: true,
      syncs: {
        orderBy: [desc(postSyncs.syncedAt)],
        limit: 1,
      },
    },
  });
}

export async function listPosts(
  businessId: string,
  opts?: {
    channelId?: string;
    state?: 'draft' | 'scheduled' | 'published' | 'failed';
    limit?: number;
  },
) {
  const limit = opts?.limit ?? 50;
  const whereConditions = [
    eq(posts.businessId, businessId),
    isNull(posts.deletedAt),
  ];

  if (opts?.channelId) {
    whereConditions.push(eq(posts.channelId, opts.channelId));
  }
  if (opts?.state) {
    whereConditions.push(eq(posts.postState, opts.state));
  }

  return db.query.posts.findMany({
    where: and(...whereConditions),
    orderBy: [desc(posts.createdAt)],
    limit,
  });
}

export async function updatePost(
  businessId: string,
  postId: string,
  data: {
    channelId?: string;
    content?: string;
    mediaUrls?: string[] | null;
    scheduledAt?: Date | string | null;
    postState?: 'draft' | 'scheduled' | 'published' | 'failed';
    platformPostId?: string | null;
    aiPrompt?: string | null;
    publishedAt?: Date | string | null;
  },
) {
  const updateData: Partial<typeof posts.$inferInsert> = {};

  if (data.channelId !== undefined) updateData.channelId = data.channelId;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.mediaUrls !== undefined) updateData.mediaUrls = data.mediaUrls;
  if (data.scheduledAt !== undefined) {
    updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  }
  if (data.postState !== undefined) updateData.postState = data.postState;
  if (data.platformPostId !== undefined) updateData.platformPostId = data.platformPostId;
  if (data.aiPrompt !== undefined) updateData.aiPrompt = data.aiPrompt;
  if (data.publishedAt !== undefined) {
    updateData.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  }

  const [updated] = await db
    .update(posts)
    .set(updateData)
    .where(and(eq(posts.id, postId), eq(posts.businessId, businessId)))
    .returning();

  return updated;
}

export async function deletePost(businessId: string, postId: string) {
  const [deleted] = await db
    .delete(posts)
    .where(and(eq(posts.id, postId), eq(posts.businessId, businessId)))
    .returning();

  return deleted;
}

export async function insertPostSync(
  postId: string,
  stats: {
    likeCount: number;
    commentCount: number;
    shareCount: number;
    reachCount: number;
  },
) {
  const [sync] = await db
    .insert(postSyncs)
    .values({
      postId,
      likeCount: stats.likeCount,
      commentCount: stats.commentCount,
      shareCount: stats.shareCount,
      reachCount: stats.reachCount,
    })
    .returning();

  return sync;
}
