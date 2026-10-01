import { eq, and, desc, ilike, sql } from 'drizzle-orm';
import { db } from '@db/client';
import { customers } from '@db/schema';
import { createCustomerInputSchema, updateCustomerInputSchema } from '@repo/shared';
import { getBusinessById } from './business';

export async function createCustomer(companyId: string, input: unknown) {
  const parsed = createCustomerInputSchema.parse(input);
  const [customer] = await db
    .insert(customers)
    .values({ ...parsed, companyId })
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

  await db.update(customers).set(parsed).where(eq(customers.id, id));
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
