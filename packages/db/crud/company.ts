import { eq, desc } from 'drizzle-orm';
import { db } from '@db/client';
import { companies, businesses } from '@db/schema';
import { createCompanyInputSchema, updateCompanyInputSchema } from '@repo/shared';
import { getBusinessById } from './business';

export async function createCompany(userId: string, input: unknown) {
  const parsed = createCompanyInputSchema.parse(input);
  const [company] = await db
    .insert(companies)
    .values({ ...parsed, userId })
    .returning();
  return company;
}

export async function getCompanyById(id: string) {
  return db.query.companies.findFirst({
    where: eq(companies.id, id),
  });
}

export async function listCompaniesByUserId(userId: string) {
  return db.query.companies.findMany({
    where: eq(companies.userId, userId),
    orderBy: [desc(companies.createdAt)],
  });
}

export async function updateCompany(id: string, userId: string, input: unknown) {
  const parsed = updateCompanyInputSchema.parse(input);
  const company = await getCompanyById(id);
  if (!company || company.userId !== userId) return null;

  await db.update(companies).set(parsed).where(eq(companies.id, id));
  return { success: true };
}

export async function deleteCompany(id: string, userId: string) {
  const company = await getCompanyById(id);
  if (!company || company.userId !== userId) return null;

  await db.delete(companies).where(eq(companies.id, id));
  return { deleted: true };
}

export async function verifyCompanyOwnership(companyId: string, userId: string) {
  const company = await getCompanyById(companyId);
  return company?.userId === userId;
}

export async function listCompanyBusinesses(companyId: string) {
  return db.query.businesses.findMany({
    where: eq(businesses.companyId, companyId),
  });
}

// Assigns a business to a company. The caller must own BOTH the company and
// the business, so ownership is checked here rather than via the access middleware.
export async function assignBusinessToCompany(companyId: string, userId: string, businessId: string) {
  const [company, business] = await Promise.all([
    getCompanyById(companyId),
    getBusinessById(businessId),
  ]);
  if (!company || company.userId !== userId) return { error: 'company' as const };
  if (!business || business.userId !== userId) return { error: 'business' as const };

  await db.update(businesses).set({ companyId }).where(eq(businesses.id, businessId));
  return { success: true };
}

export async function unassignBusiness(businessId: string, userId: string) {
  const business = await getBusinessById(businessId);
  if (!business || business.userId !== userId) return { error: 'business' as const };

  await db.update(businesses).set({ companyId: null }).where(eq(businesses.id, businessId));
  return { success: true };
}
