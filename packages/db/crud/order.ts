import { eq, and, desc, isNull, sql, gte } from 'drizzle-orm';
import { db } from '@db/client';
import { orders, products, variants } from '@db/schema';
import {
  createOrderInputSchema,
  updateOrderInputSchema,
  updateOrderStateInputSchema,
} from '@repo/shared';
import { resolveStoredImageUrl } from '@repo/integrations/b2';
import { findOrCreateCustomerByPhone, getCompanyIdForBusiness, normalizePhone } from './customer';

/** A page of order history: ten, because that is what one Messenger card list can carry. */
const ORDER_HISTORY_PAGE = 10;

export async function createOrder(input: unknown) {
  const parsed = createOrderInputSchema.parse(input);

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, parsed.productId), eq(products.businessId, parsed.businessId), isNull(products.deletedAt)),
    with: { variants: { where: isNull(variants.deletedAt) } },
  });
  if (!product) throw new Error('Product not found');

  let variant =
    parsed.variantId
      ? product.variants.find((v) => v.id === parsed.variantId)
      : product.variants.length === 1
        ? product.variants[0]
        : undefined;

  if (parsed.variantId && !variant) throw new Error('Variant not found');

  let variantPrice = parseFloat(product.price);
  if (variant) {
    variantPrice = variant.price ? parseFloat(variant.price) : variantPrice;
  }

  if (variant) {
    if (variant.stock < parsed.count) {
      throw new Error(`Insufficient stock: only ${variant.stock} available`);
    }
  }

  const totalPrice = variantPrice * parsed.count;

  // Every door an order can come in through — the agent's `create_order` tool, the
  // merchant's form, the storefront's checkout — funnels here, so this is the one place
  // that turns a typed phone number into the company's customer. A number nobody has
  // used yet writes a card; a number already in the book reuses it. No number, no card:
  // the order keeps the name it arrived with.
  const companyId = await getCompanyIdForBusiness(parsed.businessId);
  const customerId = companyId
    ? await findOrCreateCustomerByPhone({
        companyId,
        name: parsed.customerName,
        phone: parsed.customerPhone,
        address: parsed.customerAddress,
      })
    : null;

  const [order] = await db
    .insert(orders)
    .values({
      businessId: parsed.businessId,
      productId: parsed.productId,
      variantId: variant?.id ?? parsed.variantId,
      count: parsed.count,
      variantPrice: variantPrice.toFixed(2),
      customerId,
      customerName: parsed.customerName,
      customerPhone: normalizePhone(parsed.customerPhone) ?? parsed.customerPhone ?? null,
      customerAddress: parsed.customerAddress,
      conversationId: parsed.conversationId,
      // Blank rather than absent: a dashboard order has no Messenger behind it, and writing an empty
      // string here would make it look like a customer with an unknown id rather than no id.
      customerPlatformId: parsed.customerPlatformId?.trim() ? parsed.customerPlatformId.trim() : null,
      totalPrice: totalPrice.toFixed(2),
      shippingCost: (parsed.shippingCost ?? 0).toFixed(2),
      paymentMethod: parsed.paymentMethod?.trim() ? parsed.paymentMethod.trim() : null,
      state: 'pending',
    })
    .returning();

  if (variant) {
    const decremented = await db
      .update(variants)
      .set({ stock: sql`${variants.stock} - ${parsed.count}` })
      .where(and(eq(variants.id, variant.id), gte(variants.stock, parsed.count)))
      .returning({ id: variants.id, stock: variants.stock });

    if (decremented.length === 0) {
      // Race: stock changed after check — soft-delete the just-created order and fail
      await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, order.id));
      throw new Error('Insufficient stock');
    }
  }

  return {
    id: order.id,
    totalPrice,
    shippingCost: parsed.shippingCost ?? 0,
    paymentMethod: parsed.paymentMethod ?? null,
    state: order.state,
    customerId: order.customerId,
  };
}

export async function getOrderById(businessId: string, orderId: string) {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.businessId, businessId), isNull(orders.deletedAt)),
    with: {
      product: true,
      variant: true,
    },
  });
  if (!order) return null;

  const productActive = order.product && !order.product.deletedAt ? order.product : null;
  const variantActive = order.variant && !order.variant.deletedAt ? order.variant : null;
  const variantImageUrl = variantActive?.imageUrl
    ? await resolveStoredImageUrl(variantActive.imageUrl)
    : null;

  return {
    id: order.id,
    businessId: order.businessId,
    productId: order.productId,
    variantId: order.variantId,
    productName: productActive?.name ?? null,
    variantName: variantActive?.name ?? null,
    /** The five-character shelf label the buyer can find on the photo or the parcel. */
    variantShortId: variantActive?.variantId ?? null,
    variantImageUrl,
    count: order.count,
    variantPrice: parseFloat(order.variantPrice),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    state: order.state,
    totalPrice: parseFloat(order.totalPrice),
    shippingCost: parseFloat(order.shippingCost),
    paymentMethod: order.paymentMethod,
    conversationId: order.conversationId,
    createdAt: order.createdAt,
  };
}

export async function listOrders(
  businessId: string,
  options: { state?: string; limit?: number } = {},
) {
  const { state, limit = 20 } = options;
  const conditions = [eq(orders.businessId, businessId), isNull(orders.deletedAt)];
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

/**
 * Every order this Messenger customer placed with this store, newest first, one page at a time.
 *
 * Two filters, not one: the business, because another store's orders are nobody's history here, and the
 * platform id, because that is the only identity a Messenger conversation always has — a phone number is
 * given sometimes and mis-typed often.
 *
 * One query, not two: it reads `limit + 1` rows and reports whether the extra one was there, so a caller
 * learns "there are older ones" without a second round trip to count them on the reply path.
 */
export async function getOrdersByPlatformId(
  businessId: string,
  customerPlatformId: string,
  options: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = Math.min(ORDER_HISTORY_PAGE, Math.max(1, Math.trunc(options.limit ?? ORDER_HISTORY_PAGE)));

  // An empty id asks for nothing. Guarded rather than queried, because `= NULL` would match no rows
  // while a careless `''` on a legacy row could, and neither is a history anybody asked for.
  if (!customerPlatformId?.trim()) return { orders: [], hasMore: false, offset, limit };

  const rows = await db.query.orders.findMany({
    where: and(
      eq(orders.businessId, businessId),
      eq(orders.customerPlatformId, customerPlatformId),
      isNull(orders.deletedAt),
    ),
    // The variants come along with the product because a card needs a photo and only a variant has
    // one: an order placed before the size was chosen, or from a storefront that never picked one,
    // still showed the customer *their* purchase rather than nothing.
    with: {
      product: { with: { variants: { where: isNull(variants.deletedAt) } } },
      variant: true,
    },
    orderBy: [desc(orders.createdAt)],
    offset,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;

  // Signed links are minted at send time, so the page resolves them together rather than one after
  // another — a history read sits between the customer's question and their answer.
  const items = await Promise.all(
    rows.slice(0, limit).map(async (o) => {
      const productActive = o.product && !o.product.deletedAt ? o.product : null;
      const variantActive = o.variant && !o.variant.deletedAt ? o.variant : null;
      // A photo belongs to a variant, never to the product row. An order that never chose a size —
      // anything placed before the agent was made to ask — still shows the customer what they bought,
      // so the picture falls back to the first size of that product which has one.
      const storedImage =
        variantActive?.imageUrl
        ?? productActive?.variants.find((v) => v.imageUrl)?.imageUrl
        ?? null;
      const imageUrl = storedImage ? await resolveStoredImageUrl(storedImage).catch(() => null) : null;

      return {
        id: o.id,
        productId: o.productId,
        variantId: o.variantId,
        productName: productActive?.name ?? null,
        variantName: variantActive?.name ?? null,
        imageUrl,
        count: o.count,
        totalPrice: parseFloat(o.totalPrice),
        state: o.state,
        createdAt: o.createdAt,
      };
    }),
  );

  return { orders: items, hasMore, offset, limit };
}

export async function updateOrderState(businessId: string, orderId: string, input: unknown) {
  const parsed = updateOrderStateInputSchema.parse(input);
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.businessId, businessId), isNull(orders.deletedAt)),
  });
  if (!order) return null;

  const [updated] = await db
    .update(orders)
    .set({ state: parsed.state })
    .where(eq(orders.id, orderId))
    .returning();

  return { id: updated.id, newState: updated.state };
}

export async function updateOrder(businessId: string, orderId: string, input: unknown) {
  const parsed = updateOrderInputSchema.parse(input);
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.businessId, businessId), isNull(orders.deletedAt)),
  });
  if (!order) return null;

  const fields: Record<string, unknown> = { ...parsed };
  if (parsed.count !== undefined && parsed.count !== order.count) {
    if (order.state !== 'pending') {
      throw new Error('Quantity can only be changed on pending orders');
    }

    const variantPrice = parseFloat(order.variantPrice);
    fields.totalPrice = (variantPrice * parsed.count).toFixed(2);

    if (order.variantId) {
      const delta = parsed.count - order.count;
      if (delta > 0) {
        const decremented = await db
          .update(variants)
          .set({ stock: sql`${variants.stock} - ${delta}` })
          .where(and(eq(variants.id, order.variantId), gte(variants.stock, delta)))
          .returning({ id: variants.id });
        if (decremented.length === 0) {
          throw new Error('Insufficient stock for quantity increase');
        }
      } else if (delta < 0) {
        await db
          .update(variants)
          .set({ stock: sql`${variants.stock} + ${-delta}` })
          .where(eq(variants.id, order.variantId));
      }
    }
  }

  // A number retyped on the card re-matches the card: the order moves to whoever owns
  // that number now, or opens the card it was missing. An unchanged number changes
  // nothing, so an order whose card a merchant deleted is not resurrected by an edit
  // that never mentioned the phone at all.
  if (
    parsed.customerPhone !== undefined &&
    normalizePhone(parsed.customerPhone) !== normalizePhone(order.customerPhone)
  ) {
    const companyId = await getCompanyIdForBusiness(businessId);
    fields.customerId = companyId
      ? await findOrCreateCustomerByPhone({
          companyId,
          name: parsed.customerName ?? order.customerName,
          phone: parsed.customerPhone,
          address: parsed.customerAddress ?? order.customerAddress,
        })
      : null;
    fields.customerPhone = normalizePhone(parsed.customerPhone) ?? parsed.customerPhone ?? null;
  }

  const [updated] = await db
    .update(orders)
    .set(fields)
    .where(eq(orders.id, orderId))
    .returning();

  return {
    id: updated.id,
    updated: true,
    customerId: updated.customerId,
    // The card the order left, which is not the one it joined: a retyped number moves the
    // sale between two histories, and the caller has to refresh both pages.
    previousCustomerId: order.customerId,
  };
}

export async function deleteOrder(businessId: string, orderId: string) {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.businessId, businessId), isNull(orders.deletedAt)),
  });
  if (!order) return null;

  // Only unfulfilled orders still hold reserved stock. `done` orders already
  // consumed those units, so deleting the record must not put them back.
  if (order.variantId && order.state !== 'done') {
    await db
      .update(variants)
      .set({ stock: sql`${variants.stock} + ${order.count}` })
      .where(eq(variants.id, order.variantId));
  }

  await db
    .update(orders)
    .set({ deletedAt: new Date() })
    .where(eq(orders.id, orderId));
  return { deleted: true };
}
