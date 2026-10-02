'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireBusiness, expireBusinesses } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import { createBusiness, updateBusiness, deleteBusiness, hardDeleteBusiness } from '@/lib/api';


export async function createBusinessAction(formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!name) {
    redirect('/businesses/new?error=name');
  }

  const business = await createBusiness(token, {
    name,
    description: description || undefined,
    hasTradeLicense: false,
    hasTaxLicense: false,
  });

  revalidatePath('/businesses');
  expireBusinesses();
  redirect(`/b/${business.id}/dashboard`);
}

export async function updateBusinessAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const employeeCount = parseInt(String(formData.get('employeeCount') ?? ''), 10);

  await updateBusiness(token, businessId, {
    name: name || undefined,
    description: description || undefined,
    type: type || undefined,
    phone: phone || undefined,
    employeeCount: Number.isFinite(employeeCount) && employeeCount > 0 ? employeeCount : undefined,
  });

  revalidatePath('/businesses');
  revalidatePath(`/b/${businessId}`);
  expireBusiness(businessId);
  redirect(`/b/${businessId}/settings?saved=1`);
}

export async function updateStoreAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const rawSlug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const storePublished = formData.get('storePublished') === 'on';

  const payload: Record<string, unknown> = { storePublished };
  if (rawSlug) {
    const slug = rawSlug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug.length >= 2) payload.slug = slug;
  }

  await updateBusiness(token, businessId, payload);

  revalidatePath(`/b/${businessId}/settings`);
  expireBusiness(businessId);
  redirect(`/b/${businessId}/settings?saved=1`);
}

export async function deleteBusinessAction(businessId: string) {
  const token = await requireAuth();
  await deleteBusiness(token, businessId);
  revalidatePath('/businesses');
  expireBusiness(businessId);
  redirect('/businesses');
}

export async function hardDeleteBusinessAction(businessId: string) {
  const token = await requireAuth();
  await hardDeleteBusiness(token, businessId);
  revalidatePath('/businesses');
  expireBusiness(businessId);
  redirect('/businesses');
}

export async function deleteBusinessesBulkAction(formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('businessIds') as string[];
  await Promise.all(
    ids.map((id) => deleteBusiness(token, id).catch(() => null)),
  );
  revalidatePath('/businesses');
  expireBusinesses();
  for (const id of ids) expireBusiness(id);
}
