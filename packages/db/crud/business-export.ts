import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import {
  agents,
  businesses,
  categories,
  channels,
  commentThreads,
  comments,
  companies,
  conversations,
  customers,
  hourlyTokenAnalytics,
  llmTokenLogs,
  messages,
  notifications,
  orders,
  planAssignments,
  plans,
  postSyncs,
  posts,
  products,
  quotaUsage,
  users,
  variants,
  visits,
} from '@db/schema';

/** Cross-business data for the operator's business analysis export. */
export async function getPlatformBusinessExportData() {
  const [
    userRows,
    companyRows,
    customerRows,
    businessRows,
    planRows,
    categoryRows,
    productRows,
    variantRows,
    orderRows,
    channelRows,
    agentRows,
    conversationRows,
    messageRows,
    threadRows,
    commentRows,
    postRows,
    postSyncRows,
    tokenRows,
    hourlyTokenRows,
    visitRows,
    quotaRows,
    notificationRows,
    assignmentRows,
  ] = await Promise.all([
    db.select({ id: users.id, name: users.name, gender: users.gender, phone: users.phone,
      email: users.email, signInMethod: users.signInMethod, createdAt: users.createdAt })
      .from(users).where(isNull(users.deletedAt)),
    db.select().from(companies),
    db.select().from(customers),
    db.select().from(businesses).where(isNull(businesses.deletedAt)),
    db.select().from(plans),
    db.select().from(categories).where(isNull(categories.deletedAt)),
    db.select().from(products).where(isNull(products.deletedAt)),
    db.select({ id: variants.id, businessId: products.businessId, productId: variants.productId,
      variantId: variants.variantId, name: variants.name, imageUrl: variants.imageUrl,
      imageUrls: variants.imageUrls, price: variants.price, stock: variants.stock,
      isAvailable: variants.isAvailable, rating: variants.rating, createdAt: variants.createdAt })
      .from(variants).innerJoin(products, eq(variants.productId, products.id))
      .where(and(isNull(variants.deletedAt), isNull(products.deletedAt))),
    db.select().from(orders).where(isNull(orders.deletedAt)),
    // Channel credentials and raw provider metadata must never leave the database.
    db.select({ id: channels.id, businessId: channels.businessId, platform: channels.platform,
      platformChannelId: channels.platformChannelId, agentId: channels.agentId, createdAt: channels.createdAt })
      .from(channels).where(isNull(channels.deletedAt)),
    db.select().from(agents).where(isNull(agents.deletedAt)),
    db.select().from(conversations).where(isNull(conversations.deletedAt)),
    db.select({ id: messages.id, businessId: conversations.businessId,
      conversationId: messages.conversationId, from: messages.from, contentType: messages.contentType,
      content: messages.content, time: messages.time, state: messages.state,
      externalId: messages.externalId, imageKeys: messages.imageKeys })
      .from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(isNull(messages.deletedAt), isNull(conversations.deletedAt))),
    db.select().from(commentThreads).where(isNull(commentThreads.deletedAt)),
    db.select({ id: comments.id, commentThreadId: comments.commentThreadId, from: comments.from,
      contentType: comments.contentType, content: comments.content, time: comments.time,
      state: comments.state, externalId: comments.externalId, parentExternalId: comments.parentExternalId })
      .from(comments).innerJoin(commentThreads, eq(comments.commentThreadId, commentThreads.id))
      .where(and(isNull(comments.deletedAt), isNull(commentThreads.deletedAt))),
    db.select().from(posts).where(isNull(posts.deletedAt)),
    db.select({ id: postSyncs.id, postId: postSyncs.postId, likeCount: postSyncs.likeCount,
      commentCount: postSyncs.commentCount, shareCount: postSyncs.shareCount,
      reachCount: postSyncs.reachCount, syncedAt: postSyncs.syncedAt })
      .from(postSyncs).innerJoin(posts, eq(postSyncs.postId, posts.id)).where(isNull(posts.deletedAt)),
    db.select().from(llmTokenLogs),
    db.select().from(hourlyTokenAnalytics),
    // Visitor hashes are deliberately omitted; path and time remain useful for analysis.
    db.select({ id: visits.id, businessId: visits.businessId, path: visits.path, createdAt: visits.createdAt })
      .from(visits),
    db.select().from(quotaUsage),
    db.select().from(notifications),
    // Exclude operator account IDs while preserving the action history.
    db.select({ id: planAssignments.id, businessId: planAssignments.businessId,
      planId: planAssignments.planId, previousPlanId: planAssignments.previousPlanId,
      actorKind: planAssignments.actorKind, createdAt: planAssignments.createdAt })
      .from(planAssignments),
  ]);

  const groups = [
    { type: 'user', rows: userRows }, { type: 'company', rows: companyRows },
    { type: 'customer', rows: customerRows }, { type: 'business', rows: businessRows },
    { type: 'plan', rows: planRows }, { type: 'category', rows: categoryRows },
    { type: 'product', rows: productRows }, { type: 'variant', rows: variantRows },
    { type: 'order', rows: orderRows }, { type: 'channel', rows: channelRows },
    { type: 'agent', rows: agentRows }, { type: 'conversation', rows: conversationRows },
    { type: 'message', rows: messageRows }, { type: 'comment_thread', rows: threadRows },
    { type: 'comment', rows: commentRows }, { type: 'post', rows: postRows },
    { type: 'post_sync', rows: postSyncRows }, { type: 'llm_usage_log', rows: tokenRows },
    { type: 'hourly_token_analytics', rows: hourlyTokenRows }, { type: 'store_visit', rows: visitRows },
    { type: 'quota_usage', rows: quotaRows }, { type: 'notification', rows: notificationRows },
    { type: 'plan_assignment', rows: assignmentRows },
  ];
  const fileReferences: Record<string, unknown>[] = [];
  const addReferences = (type: string, field: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const refs = row[field];
      for (const [position, reference] of (Array.isArray(refs) ? refs : [refs]).entries()) {
        if (typeof reference !== 'string' || !reference) continue;
        fileReferences.push({
          businessId: row.businessId,
          ownerRecordType: type,
          ownerRecordId: row.id,
          ownerParentId: row.productId ?? row.companyId ?? row.conversationId,
          field,
          position,
          storageReference: reference,
        });
      }
    }
  };
  const rowsOf = (type: string) =>
    (groups.find((group) => group.type === type)?.rows ?? []) as Record<string, unknown>[];
  addReferences('variant', 'imageUrl', rowsOf('variant'));
  addReferences('variant', 'imageUrls', rowsOf('variant'));
  addReferences('message', 'imageKeys', rowsOf('message'));
  addReferences('post', 'mediaUrls', rowsOf('post'));
  addReferences('customer', 'avatar', rowsOf('customer'));
  addReferences('comment_thread', 'commenterAvatar', rowsOf('comment_thread'));
  for (const business of businessRows) {
    const theme = business.storeTheme as { logoUrl?: string; heroImageUrl?: string } | null;
    for (const field of ['logoUrl', 'heroImageUrl'] as const) {
      const reference = theme?.[field];
      if (reference) {
        fileReferences.push({
          businessId: business.id,
          ownerRecordType: 'business',
          ownerRecordId: business.id,
          field: `storeTheme.${field}`,
          position: 0,
          storageReference: reference,
        });
      }
    }
  }

  return [...groups, { type: 'file_reference', rows: fileReferences }];
}
