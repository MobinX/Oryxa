import { eq, and, desc, isNull } from 'drizzle-orm';
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
) {
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

  await db.insert(messages).values({
    conversationId: conv.id,
    from: 'customer',
    content: text,
    state: 'pending',
  });

  const priorStatus = conv.lastMessageState;
  await db
    .update(conversations)
    .set({ lastMessageState: 'pending' })
    .where(eq(conversations.id, conv.id));

  return { conversationId: conv.id, priorStatus };
}
