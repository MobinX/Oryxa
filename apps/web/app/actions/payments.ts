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

/**
 * The merchant's own payment list. Names are what the customer's words get matched against and
 * what an order stores, so they are deduplicated here and capped to the 40 characters the order
 * column can hold; `info` is shown to the buyer exactly as typed.
 */
export async function updatePaymentMethodsAction(
  businessId: string,
  formData: FormData,
): Promise<void> {
  const token = await requireAuth();
  const raw = String(formData.get('methods') ?? '[]');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect(`/b/${businessId}/payments?error=methods`);
  }
  if (!Array.isArray(parsed)) {
    redirect(`/b/${businessId}/payments?error=methods`);
  }

  const seen = new Set<string>();
  const methods: Array<{ name: string; info?: string; requiresTransactionId?: boolean }> = [];
  for (const row of parsed.slice(0, 20)) {
    const record = row as Record<string, unknown>;
    const name = String(record.name ?? '').trim().slice(0, 40);
    if (!name) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) {
      redirect(`/b/${businessId}/payments?error=duplicate`);
    }
    seen.add(key);
    const info = String(record.info ?? '').trim().slice(0, 200);
    methods.push({
      name,
      ...(info ? { info } : {}),
      requiresTransactionId: record.requiresTransactionId === true,
    });
  }

  await updateBusiness(token, businessId, { paymentMethods: methods });

  expireBusiness(businessId);
  revalidatePath(`/b/${businessId}/payments`);
  redirect(`/b/${businessId}/payments?saved=1`);
}

/**
 * The store-wide default for how much is paid before ordering. Only the three known values
 * are accepted; anything else is the form's mistake, not a strategy, and bounces back.
 */
export async function updatePaymentStrategyAction(
  businessId: string,
  formData: FormData,
): Promise<void> {
  const token = await requireAuth();
  const raw = String(formData.get('strategy') ?? '').trim();
  if (raw !== 'cod' && raw !== 'delivery_prepaid' && raw !== 'full_prepaid') {
    redirect(`/b/${businessId}/payments?error=strategy`);
  }

  await updateBusiness(token, businessId, { paymentStrategy: raw });

  expireBusiness(businessId);
  revalidatePath(`/b/${businessId}/payments`);
  redirect(`/b/${businessId}/payments?saved=strategy`);
}
