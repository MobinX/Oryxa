import { and, eq, isNull, sql, desc, gte, lt } from 'drizzle-orm';
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

  const responseTimeRow = await db.execute(sql`
    SELECT coalesce(
      (
        SELECT avg(extract(epoch from (m2.time - m1.time)))
        FROM messages m1
        JOIN messages m2 ON m1.conversation_id = m2.conversation_id
        JOIN conversations c ON m1.conversation_id = c.id
        WHERE c.business_id = ${businessId}::uuid
          AND m1.from = 'customer'
          AND m2.from = 'agent'
          AND m2.time > m1.time
          AND m2.time = (
            SELECT min(m3.time)
            FROM messages m3
            WHERE m3.conversation_id = m1.conversation_id
              AND m3.from = 'agent'
              AND m3.time > m1.time
          )
      ),
      0
    )::float as avg_seconds
  `);

  const responseTimeRows = (responseTimeRow as any).rows ?? responseTimeRow;
  const avgResponseTime = (responseTimeRows[0] as any)?.avg_seconds ?? 0;

  return {
    products: productsRow[0]?.count ?? 0,
    orders: ordersRow[0]?.count ?? 0,
    channels: channelsRow[0]?.count ?? 0,
    conversations: conversationsRow[0]?.count ?? 0,
    revenue: parseFloat(revenueRow[0]?.sum ?? '0'),
    messages: messagesRow[0]?.count ?? 0,
    avgResponseTime,
  };
}

export async function getBusinessAnalytics(businessId: string, days: number = 30) {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

  // Helper to generate full date range for series
  const generateDateSeries = (numDays: number) => {
    const series = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const YYYY = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, '0');
      const DD = String(d.getDate()).padStart(2, '0');
      series.push(`${YYYY}-${MM}-${DD}`);
    }
    return series;
  };

  const dates = generateDateSeries(days);

  // 1. All-time Totals
  const totals = await getBusinessStats(businessId);

  // 2. Daily Orders for the current period
  const dailyOrdersRaw = await db
    .select({
      date: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        isNull(orders.deletedAt),
        gte(orders.createdAt, currentStart),
        lt(orders.createdAt, now)
      )
    )
    .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

  const dailyOrdersMap = new Map(dailyOrdersRaw.map((r) => [r.date, r]));
  const dailyOrders = dates.map((date) => {
    const raw = dailyOrdersMap.get(date);
    return {
      date,
      count: raw?.count ?? 0,
      revenue: raw?.revenue ?? 0,
    };
  });

  // 3. Daily Messages (from customer) for current period
  const dailyMessagesRaw = await db
    .select({
      date: sql<string>`to_char(${messages.time}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(messages.from, 'customer'),
        isNull(messages.deletedAt),
        isNull(conversations.deletedAt),
        gte(messages.time, currentStart),
        lt(messages.time, now)
      )
    )
    .groupBy(sql`to_char(${messages.time}, 'YYYY-MM-DD')`);

  const dailyMessagesMap = new Map(dailyMessagesRaw.map((r) => [r.date, r]));
  const dailyMessages = dates.map((date) => {
    const raw = dailyMessagesMap.get(date);
    return {
      date,
      count: raw?.count ?? 0,
    };
  });

  // 4. Daily Conversations for current period
  const dailyConversationsRaw = await db
    .select({
      date: sql<string>`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        isNull(conversations.deletedAt),
        gte(conversations.createdAt, currentStart),
        lt(conversations.createdAt, now)
      )
    )
    .groupBy(sql`to_char(${conversations.createdAt}, 'YYYY-MM-DD')`);

  const dailyConversationsMap = new Map(dailyConversationsRaw.map((r) => [r.date, r]));
  const dailyConversations = dates.map((date) => {
    const raw = dailyConversationsMap.get(date);
    return {
      date,
      count: raw?.count ?? 0,
    };
  });

  // 5. Orders by State
  const ordersByState = await db
    .select({
      state: orders.state,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
    })
    .from(orders)
    .where(and(eq(orders.businessId, businessId), isNull(orders.deletedAt)))
    .groupBy(orders.state);

  // 6. Recent Orders (last 10)
  const recentOrdersRaw = await db
    .select({
      id: orders.id,
      customerName: orders.customerName,
      totalPrice: sql<number>`${orders.totalPrice}::float`,
      state: orders.state,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.businessId, businessId), isNull(orders.deletedAt)))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  const recentOrders = recentOrdersRaw.map((o) => ({
    ...o,
    createdAt: o.createdAt.toISOString(),
  }));

  // 7. Recent Conversations (last 5)
  const recentConversationsRaw = await db
    .select({
      id: conversations.id,
      customerName: conversations.customerName,
      channelId: conversations.channelId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(and(eq(conversations.businessId, businessId), isNull(conversations.deletedAt)))
    .orderBy(desc(conversations.createdAt))
    .limit(5);

  const recentConversations = recentConversationsRaw.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }));

  // 8. Comparison Period Stats
  // Current Period sums
  const [currentPeriodOrders] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        isNull(orders.deletedAt),
        gte(orders.createdAt, currentStart),
        lt(orders.createdAt, now)
      )
    );

  const [currentPeriodMessages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.businessId, businessId),
        isNull(messages.deletedAt),
        isNull(conversations.deletedAt),
        gte(messages.time, currentStart),
        lt(messages.time, now)
      )
    );

  const [currentPeriodConversations] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        isNull(conversations.deletedAt),
        gte(conversations.createdAt, currentStart),
        lt(conversations.createdAt, now)
      )
    );

  // Previous Period sums
  const [prevPeriodOrders] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalPrice}), 0)::float`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        isNull(orders.deletedAt),
        gte(orders.createdAt, previousStart),
        lt(orders.createdAt, currentStart)
      )
    );

  const [prevPeriodMessages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.businessId, businessId),
        isNull(messages.deletedAt),
        isNull(conversations.deletedAt),
        gte(messages.time, previousStart),
        lt(messages.time, currentStart)
      )
    );

  const [prevPeriodConversations] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        isNull(conversations.deletedAt),
        gte(conversations.createdAt, previousStart),
        lt(conversations.createdAt, currentStart)
      )
    );

  return {
    totals,
    dailyOrders,
    dailyMessages,
    dailyConversations,
    ordersByState,
    recentOrders,
    recentConversations,
    comparison: {
      orders: {
        current: currentPeriodOrders?.count ?? 0,
        previous: prevPeriodOrders?.count ?? 0,
      },
      revenue: {
        current: currentPeriodOrders?.revenue ?? 0,
        previous: prevPeriodOrders?.revenue ?? 0,
      },
      messages: {
        current: currentPeriodMessages?.count ?? 0,
        previous: prevPeriodMessages?.count ?? 0,
      },
      conversations: {
        current: currentPeriodConversations?.count ?? 0,
        previous: prevPeriodConversations?.count ?? 0,
      },
    },
  };
}

