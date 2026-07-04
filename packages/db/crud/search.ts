import { and, eq, isNull, ilike, or, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { products, categories, orders, messages, conversations } from '@db/schema';

export async function searchBusinessData(businessId: string, query: string) {
  if (!query || !query.trim()) {
    return { products: [], categories: [], orders: [], messages: [] };
  }
  const pattern = `%${query.trim()}%`;

  const [matchingProducts, matchingCategories, matchingOrders, matchingMessages] = await Promise.all([
    // Search Products
    db.query.products.findMany({
      where: and(
        eq(products.businessId, businessId),
        isNull(products.deletedAt),
        or(
          ilike(products.name, pattern),
          ilike(products.description, pattern)
        )
      ),
      limit: 10,
    }),

    // Search Categories
    db.query.categories.findMany({
      where: and(
        eq(categories.businessId, businessId),
        isNull(categories.deletedAt),
        ilike(categories.name, pattern)
      ),
      limit: 10,
    }),

    // Search Orders
    db.query.orders.findMany({
      where: and(
        eq(orders.businessId, businessId),
        isNull(orders.deletedAt),
        or(
          ilike(orders.customerName, pattern),
          ilike(orders.customerPhone, pattern),
          ilike(sql<string>`cast(${orders.state} as text)`, pattern)
        )
      ),
      limit: 10,
    }),

    // Search Messages
    db
      .select({
        id: messages.id,
        content: messages.content,
        from: messages.from,
        time: messages.time,
        conversationId: conversations.id,
        customerName: conversations.customerName,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.businessId, businessId),
          isNull(messages.deletedAt),
          isNull(conversations.deletedAt),
          ilike(messages.content, pattern)
        )
      )
      .limit(10),
  ]);

  return {
    products: matchingProducts.map((p) => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      description: p.description,
    })),
    categories: matchingCategories.map((c) => ({
      id: c.id,
      name: c.name,
    })),
    orders: matchingOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      totalPrice: parseFloat(o.totalPrice),
      state: o.state,
      createdAt: o.createdAt.toISOString(),
    })),
    messages: matchingMessages.map((m) => ({
      id: m.id,
      content: m.content,
      from: m.from,
      time: m.time.toISOString(),
      conversationId: m.conversationId,
      customerName: m.customerName,
    })),
  };
}
