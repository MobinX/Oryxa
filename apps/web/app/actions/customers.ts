'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireCustomers } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import { ApiError, createCustomer, deleteCustomer, updateCustomer } from '@/lib/api';

const PAGE = (businessId: string) => `/b/${businessId}/customers`;

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Every write here is scoped by business, and the API resolves that to the owning
 * company's book. A business with no company answers 400 — that is the state most
 * merchants are in, so it becomes a sentence on the page rather than a stack trace.
 */
export async function createCustomerAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = field(formData, 'name');
  if (!name) redirect(`${PAGE(businessId)}?error=${encodeURIComponent('Name is required.')}`);

  try {
    await createCustomer(token, businessId, {
      name,
      phone: field(formData, 'phone') || undefined,
      email: field(formData, 'email') || undefined,
      address: field(formData, 'address') || undefined,
      avatar: field(formData, 'avatar') || undefined,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`${PAGE(businessId)}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(PAGE(businessId));
  expireCustomers(businessId);
  redirect(PAGE(businessId));
}

export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  // Empty means "left alone", not "cleared": the update schema takes a plain
  // `z.string().email()` for these, so an empty string would be rejected rather
  // than stored as null. Clearing one needs a nullable input field, which is a
  // contract change and not part of this merge.
  const optional = (key: string) => field(formData, key) || undefined;
  try {
    await updateCustomer(token, businessId, customerId, {
      name: optional('name'),
      phone: optional('phone'),
      email: optional('email'),
      address: optional('address'),
      avatar: optional('avatar'),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`${PAGE(businessId)}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(PAGE(businessId));
  expireCustomers(businessId);
  redirect(PAGE(businessId));
}

export async function deleteCustomerAction(businessId: string, customerId: string) {
  const token = await requireAuth();
  try {
    await deleteCustomer(token, businessId, customerId);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`${PAGE(businessId)}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(PAGE(businessId));
  expireCustomers(businessId);
}
