'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireBusiness } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import { updateBusiness } from '@/lib/api';

/**
 * The delivery list is small and merchant-owned. It is validated again by the API; this
 * parser's job is to keep blank rows and non-numeric prices out of the request.
 */
export async function updateDeliveryZonesAction(
  businessId: string,
  formData: FormData,
): Promise<void> {
  const token = await requireAuth();
  const raw = String(formData.get('zones') ?? '[]');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect(`/b/${businessId}/payments?error=invalid`);
  }
  if (!Array.isArray(parsed)) {
    redirect(`/b/${businessId}/payments?error=invalid`);
  }

  const rows = parsed
    .slice(0, 20)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        label: String(record.label ?? '').trim().slice(0, 80),
        price: Number(record.price),
      };
    });

  // A named region with a price nobody typed is a mistake, not an empty row: refuse rather
  // than quietly drop the region the merchant meant to charge for.
  if (rows.some((row) => row.label.length > 0 && (!Number.isFinite(row.price) || row.price < 0))) {
    redirect(`/b/${businessId}/payments?error=price`);
  }

  const zones = rows.filter((row) => row.label.length > 0);

  await updateBusiness(token, businessId, { deliveryZones: zones });

  expireBusiness(businessId);
  revalidatePath(`/b/${businessId}/payments`);
  redirect(`/b/${businessId}/payments?saved=1`);
}
