import { eq, and, desc } from 'drizzle-orm';
import { db } from '../client';
import { orders, products, variants } from '../schema';
import { createOrderInputSchema, updateOrderStateInputSchema } from '@repo/shared';

export async function createOrder(input: unknown) {
  const parsed = createOrderInputSchema.parse(input);

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, parsed.productId), eq(products.businessId, parsed.businessId)),
    with: { variants: true },
  });
  if (!product) throw new Error('Product not found');

  let variantPrice = parseFloat(product.price);
  if (parsed.variantId) {
    const variant = product.variants.find((v) => v.id === parsed.variantId);
    if (!variant) throw new Error('Variant not found');
    variantPrice = variant.price ? parseFloat(variant.price) : variantPrice;
  }

  const totalPrice = variantPrice * parsed.count;

  const [order] = await db
    .insert(orders)
    .values({
      businessId: parsed.businessId,
      productId: parsed.productId,
      variantId: parsed.variantId,
      count: parsed.count,
      variantPrice: variantPrice.toFixed(2),
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      customerAddress: parsed.customerAddress,
      conversationId: parsed.conversationId,
      totalPrice: totalPrice.toFixed(2),
      state: 'pending',
    })
    .returning();

  return {
    id: order.id,
    totalPrice,
    state: order.state,
  };
}

export async function listOrders(
  businessId: string,
  options: { state?: string; limit?: number } = {},
) {
  const { state, limit = 20 } = options;
  const conditions = [eq(orders.businessId, businessId)];
  if (state) conditions.push(eq(orders.state, state as typeof orders.state.enumValues[number]));

  const items = await db.query.orders.findMany({
    where: and(...conditions),
    limit,
    orderBy: [desc(orders.createdAt)],
  });

  return items.map((o) => ({
    id: o.id,
    customerName: o.customerName,
    totalPrice: parseFloat(o.totalPrice),
    state: o.state,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function updateOrderState(businessId: string, orderId: string, input: unknown) {
  const parsed = updateOrderStateInputSchema.parse(input);
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.businessId, businessId)),
  });
  if (!order) return null;

  const [updated] = await db
    .update(orders)
    .set({ state: parsed.state })
    .where(eq(orders.id, orderId))
    .returning();

  return { id: updated.id, newState: updated.state };
}
