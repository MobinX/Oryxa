import { eq, and, asc, desc, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { businesses, customers, orders, products, variants } from '@db/schema';
import { createCustomerInputSchema, updateCustomerInputSchema } from '@repo/shared';
import { getBusinessById } from './business';

/**
 * `0300-1234567`, `0300 1234567` and `+92 300 1234567` are the same buyer typing the
 * same number twice, so the number a customer is found by keeps digits and a leading
 * plus and drops everything a keyboard puts in the way.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const kept = (raw ?? '').replace(/[^\d+]/g, '');
  const digits = kept.replace(/\+/g, '');
  if (!digits) return null;
  return kept.startsWith('+') ? `+${digits}` : digits;
}

/** Cards in one company whose stored number is the same number once punctuation goes. */
function samePhoneAs(phone: string) {
  return sql`regexp_replace(${customers.phone}, '[^0-9+]', '', 'g') = ${phone}`;
}

/**
 * The one place a customer is created out of an order, whichever door the order came
 * through — the agent's tool call, the dashboard's form, the storefront's checkout — so
 * none of them has to agree on what dedupe means. A card is matched on its number within
 * the company that owns the business, oldest first; with no card yet, one is written.
 * Without a number there is nothing to match on and no card is invented: the order simply
 * keeps the name it was given.
 */
export async function findOrCreateCustomerByPhone(input: {
  companyId: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
}): Promise<string | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.companyId, input.companyId), samePhoneAs(phone)),
    orderBy: [asc(customers.createdAt)],
  });

  if (existing) {
    // A card an order wrote has no address on it; a card a merchant typed is never
    // rewritten by an order. Fill the hole, keep whatever is already there.
    if (!existing.address && input.address) {
      await db.update(customers).set({ address: input.address }).where(eq(customers.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(customers)
    .values({
      companyId: input.companyId,
      name: input.name?.trim() || 'Customer',
      phone,
      address: input.address ?? null,
    })
    .returning();

  return created?.id ?? null;
}

export async function createCustomer(companyId: string, input: unknown) {
  const parsed = createCustomerInputSchema.parse(input);
  const [customer] = await db
    .insert(customers)
    .values({ ...parsed, phone: normalizePhone(parsed.phone), companyId })
    .returning();
  return customer;
}

export async function getCustomerById(id: string) {
  return db.query.customers.findFirst({
    where: eq(customers.id, id),
  });
}

export async function listCustomers(
  companyId: string,
  options: { search?: string; limit?: number; offset?: number } = {},
) {
  const { search, limit = 20, offset = 0 } = options;
  const conditions = [eq(customers.companyId, companyId)];
  if (search) conditions.push(ilike(customers.name, `%${search}%`));

  const items = await db.query.customers.findMany({
    where: and(...conditions),
    limit,
    offset,
    orderBy: [desc(customers.createdAt)],
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(...conditions));

  return {
    customers: items,
    totalCount: countResult?.count ?? 0,
  };
}

export async function updateCustomer(id: string, companyId: string, input: unknown) {
  const parsed = updateCustomerInputSchema.parse(input);
  const customer = await getCustomerById(id);
  if (!customer || customer.companyId !== companyId) return null;

  await db
    .update(customers)
    .set({ ...parsed, phone: parsed.phone === undefined ? undefined : normalizePhone(parsed.phone) })
    .where(eq(customers.id, id));
  return { success: true };
}

export async function deleteCustomer(id: string, companyId: string) {
  const customer = await getCustomerById(id);
  if (!customer || customer.companyId !== companyId) return null;

  await db.delete(customers).where(eq(customers.id, id));
  return { deleted: true };
}

export async function getCompanyIdForBusiness(businessId: string): Promise<string | null> {
  const business = await getBusinessById(businessId);
  return business?.companyId ?? null;
}

// Validates that a customer belongs to the company that owns the given business.
// Used by product create/update so a company can only link its own customers.
export async function isCustomerInBusinessCompany(
  customerId: string,
  businessId: string,
): Promise<boolean> {
  const companyId = await getCompanyIdForBusiness(businessId);
  if (!companyId) return false;
  const customer = await getCustomerById(customerId);
  return !!customer && customer.companyId === companyId;
}

export type CustomerOrder = {
  id: string;
  businessId: string;
  storeName: string;
  productId: string | null;
  productName: string | null;
  variantName: string | null;
  count: number;
  unitPrice: number;
  totalPrice: number;
  state: string;
  createdAt: Date;
};

export type CustomerPurchase = {
  productId: string;
  productName: string;
  orders: number;
  units: number;
  spent: number;
  firstOrderedAt: Date;
  lastOrderedAt: Date;
};

/**
 * Everything the merchant wants to know about one person: the card itself, every order
 * under it across the company's stores, and the same orders folded up by product so a
 * second cup of the same coffee is visible as a habit rather than as two rows. Folded in
 * JS rather than SQL because an order whose product has since been deleted still counts,
 * and a product with no name on it should not vanish from a person's history.
 */
export async function getCustomerHistory(customerId: string): Promise<{
  customer: typeof customers.$inferSelect;
  orders: CustomerOrder[];
  purchases: CustomerPurchase[];
  stats: { orders: number; units: number; spent: number; firstOrderedAt: Date | null; lastOrderedAt: Date | null };
} | null> {
  const customer = await getCustomerById(customerId);
  if (!customer) return null;

  const rows = await db
    .select({
      id: orders.id,
      businessId: orders.businessId,
      storeName: businesses.name,
      productId: orders.productId,
      productName: products.name,
      variantName: variants.name,
      count: orders.count,
      unitPrice: orders.variantPrice,
      totalPrice: orders.totalPrice,
      state: orders.state,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(businesses, eq(orders.businessId, businesses.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(variants, eq(orders.variantId, variants.id))
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(businesses.companyId, customer.companyId),
        isNull(orders.deletedAt),
      ),
    )
    .orderBy(desc(orders.createdAt));

  const byProduct = new Map<string, CustomerPurchase>();
  let units = 0;
  let spent = 0;
  let firstOrderedAt: Date | null = null;
  let lastOrderedAt: Date | null = null;

  for (const row of rows) {
    const price = parseFloat(row.totalPrice);
    units += row.count;
    spent += price;
    if (!lastOrderedAt) lastOrderedAt = row.createdAt;
    firstOrderedAt = row.createdAt;

    if (!row.productId) continue;
    const seen = byProduct.get(row.productId);
    if (seen) {
      seen.orders += 1;
      seen.units += row.count;
      seen.spent = Math.round((seen.spent + price) * 100) / 100;
      seen.firstOrderedAt = row.createdAt;
      continue;
    }
    byProduct.set(row.productId, {
      productId: row.productId,
      productName: row.productName ?? 'Deleted product',
      orders: 1,
      units: row.count,
      spent: Math.round(price * 100) / 100,
      firstOrderedAt: row.createdAt,
      lastOrderedAt: row.createdAt,
    });
  }

  return {
    customer,
    orders: rows.map((row) => ({
      id: row.id,
      businessId: row.businessId,
      storeName: row.storeName,
      productId: row.productId,
      productName: row.productName,
      variantName: row.variantName,
      count: row.count,
      unitPrice: parseFloat(row.unitPrice),
      totalPrice: parseFloat(row.totalPrice),
      state: row.state,
      createdAt: row.createdAt,
    })),
    purchases: [...byProduct.values()].sort(
      (a, b) => b.orders - a.orders || b.lastOrderedAt.getTime() - a.lastOrderedAt.getTime(),
    ),
    stats: {
      orders: rows.length,
      units,
      spent: Math.round(spent * 100) / 100,
      firstOrderedAt,
      lastOrderedAt,
    },
  };
}
