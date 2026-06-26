'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createBusiness } from '@/lib/api';

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
