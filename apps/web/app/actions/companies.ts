'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireBusiness, expireCompanies, expireCustomers } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import {
  ApiError,
  assignBusinessToCompany,
  createCompany,
  deleteCompany,
  getCompanyBusinesses,
  unassignBusinessFromCompany,
  updateCompany,
} from '@/lib/api';

const PAGE = (businessId: string) => `/b/${businessId}/companies`;

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function fail(businessId: string, err: unknown): never {
  if (err instanceof ApiError) {
    redirect(`${PAGE(businessId)}?error=${encodeURIComponent(err.message)}`);
  }
  throw err;
}

export async function createCompanyAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = field(formData, 'name');
  if (!name) redirect(`${PAGE(businessId)}?error=${encodeURIComponent('Name is required.')}`);

  try {
    await createCompany(token, {
      name,
      description: field(formData, 'description') || undefined,
      phone: field(formData, 'phone') || undefined,
    });
  } catch (err) {
    fail(businessId, err);
  }

  revalidatePath(PAGE(businessId));
  expireCompanies();
  redirect(PAGE(businessId));
}

export async function updateCompanyAction(
  businessId: string,
  companyId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const optional = (key: string) => field(formData, key) || undefined;
  try {
    await updateCompany(token, companyId, {
      name: optional('name'),
      description: optional('description'),
      phone: optional('phone'),
    });
  } catch (err) {
    fail(businessId, err);
  }

  revalidatePath(PAGE(businessId));
  expireCompanies();
  redirect(PAGE(businessId));
}

/**
 * Deleting a company cascades to its customers, so it is the one write here that
 * has to invalidate the customer book of every business that pointed at it.
 */
export async function deleteCompanyAction(businessId: string, companyId: string) {
  const token = await requireAuth();
  let linked: string[] = [];
  try {
    linked = (await getCompanyBusinesses(token, companyId)).businesses.map((b) => b.id);
    await deleteCompany(token, companyId);
  } catch (err) {
    fail(businessId, err);
  }

  revalidatePath(PAGE(businessId));
  expireCompanies();
  for (const id of linked) {
    expireCustomers(id);
    expireBusiness(id);
  }
  redirect(PAGE(businessId));
}

export async function assignBusinessAction(businessId: string, companyId: string, formData: FormData) {
  const token = await requireAuth();
  const targetId = field(formData, 'businessId');
  if (!targetId) redirect(`${PAGE(businessId)}?error=${encodeURIComponent('Pick a store first.')}`);

  try {
    await assignBusinessToCompany(token, companyId, targetId);
  } catch (err) {
    fail(businessId, err);
  }

  revalidatePath(PAGE(businessId));
  revalidatePath(`/b/${targetId}/customers`);
  expireCompanies();
  expireCustomers(targetId);
  expireBusiness(targetId);
  redirect(PAGE(businessId));
}

export async function unassignBusinessAction(
  businessId: string,
  companyId: string,
  targetBusinessId: string,
) {
  const token = await requireAuth();
  try {
    await unassignBusinessFromCompany(token, companyId, targetBusinessId);
  } catch (err) {
    fail(businessId, err);
  }

  revalidatePath(PAGE(businessId));
  revalidatePath(`/b/${targetBusinessId}/customers`);
  expireCompanies();
  expireCustomers(targetBusinessId);
  expireBusiness(targetBusinessId);
  redirect(PAGE(businessId));
}
