import { eq, and, desc, isNull, inArray, asc } from 'drizzle-orm';
import { db } from '@db/client';
import { conversations, messages } from '@db/schema';

export async function getOrCreateConversation(
  businessId: string,
  channelId: string,
  customerPlatformId: string,
  customerName?: string,
) {
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.channelId, channelId),
      eq(conversations.customerPlatformId, customerPlatformId),
      isNull(conversations.deletedAt),
    ),
  });

  if (existing) return existing;

  const [created] = await db
    .insert(conversations)
    .values({
      businessId,
      channelId,
      customerPlatformId,
      customerName,
    })
    .returning();

  return created;
}

export async function getConversationWithHistory(conversationId: string) {
  return db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)),
    with: {
      messages: {
        where: isNull(messages.deletedAt),
        orderBy: [desc(messages.time)],
        limit: 10,
      },
      channel: {
        with: { agent: true, business: true },
      },
      business: true,
    },
  });
}

export async function createMessage(data: {
  conversationId: string;
  from: 'self' | 'customer';
  content: string;
  contentType?: string;
  state?: 'pending' | 'working' | 'done';
}) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: data.conversationId,
      from: data.from,
      content: data.content,
      contentType: data.contentType ?? 'text',
      state: data.state ?? (data.from === 'customer' ? 'pending' : 'done'),
    })
    .returning();

  if (data.from === 'customer') {
    await db
      .update(conversations)
      .set({ lastMessageState: 'pending' })
      .where(eq(conversations.id, data.conversationId));
  }

  return message;
}

export async function updateConversationState(
  conversationId: string,
  state: 'pending' | 'working' | 'done',
) {
  await db
    .update(conversations)
    .set({ lastMessageState: state })
    .where(eq(conversations.id, conversationId));
}

export async function checkPendingMessages(conversationId: string) {
  const pending = await db.query.messages.findFirst({
    where: and(
      eq(messages.conversationId, conversationId),
      eq(messages.from, 'customer'),
      eq(messages.state, 'pending'),
      isNull(messages.deletedAt),
    ),
  });
  return !!pending;
}

/**
 * Returns every still-pending customer message in a conversation, oldest first,
 * with no limit. Used by the agent runner to drain a whole backlog in one run
 * (so a burst of >10 messages is replied to in order instead of the newest 10
 * first and the older ones in a later, out-of-order follow-up).
 */
export async function listPendingCustomerMessages(conversationId: string) {
  return db.query.messages.findMany({
    where: and(
      eq(messages.conversationId, conversationId),
      eq(messages.from, 'customer'),
      eq(messages.state, 'pending'),
      isNull(messages.deletedAt),
    ),
    orderBy: [asc(messages.time)],
  });
}

export async function markCustomerMessagesDone(conversationId: string) {
  await db
    .update(messages)
    .set({ state: 'done' })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.from, 'customer'),
        eq(messages.state, 'pending'),
      ),
    );
}

/**
 * Marks specific customer messages as done (by id). Used after an agent run to
 * clear only the messages the agent actually replied to, leaving any messages
 * that arrived during the run pending so the tail re-trigger can handle them.
 */
export async function markMessagesDoneByIds(conversationId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(messages)
    .set({ state: 'done' })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        inArray(messages.id, ids),
      ),
    );
}

/**
 * Atomically transitions a conversation from idle ('done' or 'pending') to
 * 'working'. Returns true if this caller won the claim — i.e. this caller
 * should run the agent. Concurrent callers (or a state already 'working') get
 * false and must not run, which prevents duplicate agent runs when Meta
 * delivers overlapping webhooks or the tail re-trigger races with a new inbound.
 */
export async function claimConversationForAgentRun(conversationId: string): Promise<boolean> {
  const claimed = await db
    .update(conversations)
    .set({ lastMessageState: 'working' })
    .where(
      and(
        eq(conversations.id, conversationId),
        inArray(conversations.lastMessageState, ['done', 'pending']),
      ),
    )
    .returning({ id: conversations.id });
  return claimed.length > 0;
}

export async function listConversations(
  businessId: string,
  options: { state?: string; limit?: number } = {},
) {
  const { state, limit = 20 } = options;
  const conditions = [eq(conversations.businessId, businessId), isNull(conversations.deletedAt)];
  if (state) conditions.push(eq(conversations.lastMessageState, state as 'pending'));

  return db.query.conversations.findMany({
    where: and(...conditions),
    limit,
    orderBy: [desc(conversations.createdAt)],
  });
}

export async function listMessages(conversationId: string, businessId: string, limit = 50) {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId), isNull(conversations.deletedAt)),
  });
  if (!conv) return null;

  const msgs = await db.query.messages.findMany({
    where: and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)),
    orderBy: [messages.time],
    limit,
  });

  return msgs.map((m) => ({
    id: m.id,
    from: m.from,
    content: m.content,
    contentType: m.contentType,
    time: m.time.toISOString(),
  }));
}

export async function getConversationForBusiness(conversationId: string, businessId: string) {
  return db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId), isNull(conversations.deletedAt)),
    with: { channel: true },
  });
}

export async function deleteConversation(businessId: string, conversationId: string) {
  const conv = await getConversationForBusiness(conversationId, businessId);
  if (!conv) return null;
  await db
    .update(conversations)
    .set({ deletedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  return { deleted: true };
}

export async function deleteMessage(conversationId: string, messageId: string) {
  const msg = await db.query.messages.findFirst({
    where: and(eq(messages.id, messageId), eq(messages.conversationId, conversationId), isNull(messages.deletedAt)),
  });
  if (!msg) return null;
  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(eq(messages.id, messageId));
  return { deleted: true };
}

export async function processInboundMessage(
  channel: { id: string; businessId: string },
  senderId: string,
  text: string,
  externalId?: string,
): Promise<{ conversationId: string; priorStatus: string; inserted: boolean; needsProfile: boolean }> {
  let conv = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.channelId, channel.id),
      eq(conversations.customerPlatformId, senderId),
      isNull(conversations.deletedAt),
    ),
  });

  if (!conv) {
    const [created] = await db
      .insert(conversations)
      .values({
        businessId: channel.businessId,
        channelId: channel.id,
        customerPlatformId: senderId,
      })
      .returning();
    conv = created;
  }

  const priorStatus = conv.lastMessageState;

  if (externalId) {
    const inserted = await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        from: 'customer',
        content: text,
        state: 'pending',
        externalId,
      })
      .onConflictDoNothing({ target: messages.externalId })
      .returning();

    if (inserted.length === 0) {
      return { conversationId: conv.id, priorStatus, inserted: false, needsProfile: false };
    }
  } else {
    await db.insert(messages).values({
      conversationId: conv.id,
      from: 'customer',
      content: text,
      state: 'pending',
    });
  }

  // Mark the conversation as needing attention, but only if it was idle — never
  // downgrade an in-progress ('working') run, which would confuse the agent
  // state machine and the UI.
  await db
    .update(conversations)
    .set({ lastMessageState: 'pending' })
    .where(and(eq(conversations.id, conv.id), eq(conversations.lastMessageState, 'done')));

  // Name/avatar aren't in the Messenger webhook payload — they must be looked up
  // from the Graph API. Signal the webhook to do that once, only while missing.
  const needsProfile = !conv.customerName || !conv.customerAvatar;

  return { conversationId: conv.id, priorStatus, inserted: true, needsProfile };
}

/**
 * Fills in MISSING name/avatar on a conversation only — each field is written
 * solely when its column is NULL, so a cached value is never overwritten by a
 * re-fetch. Called after a best-effort Graph profile lookup.
 */
export async function setConversationProfileIfMissing(
  conversationId: string,
  profile: { name?: string; avatar?: string },
): Promise<void> {
  if (profile.name !== undefined) {
    await db
      .update(conversations)
      .set({ customerName: profile.name })
      .where(and(eq(conversations.id, conversationId), isNull(conversations.customerName)));
  }
  if (profile.avatar !== undefined) {
    await db
      .update(conversations)
      .set({ customerAvatar: profile.avatar })
      .where(and(eq(conversations.id, conversationId), isNull(conversations.customerAvatar)));
  }
}
