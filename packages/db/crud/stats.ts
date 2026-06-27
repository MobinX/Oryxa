import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { channels, conversations, orders, products, messages } from '@db/schema';

export async function getBusinessStats(businessId: string) {
  const base = eq(products.businessId, businessId);
  const notDeleted = isNull(products.deletedAt);

  const [productsRow, ordersRow, channelsRow, conversationsRow, revenueRow, messagesRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(base, notDeleted)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.businessId, businessId), isNull(orders.deletedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(channels)
      .where(and(eq(channels.businessId, businessId), isNull(channels.deletedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(eq(conversations.businessId, businessId), isNull(conversations.deletedAt))),
    db
      .select({ sum: sql<string>`coalesce(sum(total_price), 0)::text` })
      .from(orders)
      .where(and(eq(orders.businessId, businessId), isNull(orders.deletedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.businessId, businessId),
          isNull(messages.deletedAt),
          isNull(conversations.deletedAt),
        ),
      ),
  ]);

  return {
    products: productsRow[0]?.count ?? 0,
    orders: ordersRow[0]?.count ?? 0,
    channels: channelsRow[0]?.count ?? 0,
    conversations: conversationsRow[0]?.count ?? 0,
    revenue: parseFloat(revenueRow[0]?.sum ?? '0'),
    messages: messagesRow[0]?.count ?? 0,
  };
}
