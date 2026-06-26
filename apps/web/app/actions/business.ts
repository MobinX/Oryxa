'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createBusiness, updateBusiness, deleteBusiness } from '@/lib/api';

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
  redirect('/businesses');
}

export async function deleteBusinessAction(businessId: string) {
  const token = await requireAuth();
  await deleteBusiness(token, businessId);
  revalidatePath('/businesses');
  redirect('/businesses');
}

export async function deleteBusinessesBulkAction(formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('businessIds') as string[];
  await Promise.all(
    ids.map((id) => deleteBusiness(token, id).catch(() => null)),
  );
  revalidatePath('/businesses');
}
