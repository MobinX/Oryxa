'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireConsoleBearer } from '@/lib/admin-access';
import { expireModelBilling } from '@/app/_cache/tags';
import { ApiError, saveAdminModelBilling } from '@/lib/api';

function detail(err: unknown): string {
  const message = err instanceof ApiError || err instanceof Error ? err.message : 'The request did not arrive';
  return encodeURIComponent(message.slice(0, 300));
}

export async function saveModelBillingAction(formData: FormData) {
  const bearer = await requireConsoleBearer();

  const provider = String(formData.get('provider') ?? '').trim();
  const model = String(formData.get('model') ?? '').trim();
  const input = Number(formData.get('inputUsdPerMillion'));
  const output = Number(formData.get('outputUsdPerMillion'));
  const cached = Number(formData.get('cachedInputUsdPerMillion'));

  if (
    !provider ||
    !model ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    !Number.isFinite(cached) ||
    input < 0 ||
    output < 0 ||
    cached < 0
  ) {
    redirect('/admin/model-billing?error=invalid');
  }

  try {
    await saveAdminModelBilling(bearer, {
      provider: provider.slice(0, 50),
      model: model.slice(0, 100),
      inputUsdPerMillion: input,
      outputUsdPerMillion: output,
      cachedInputUsdPerMillion: cached,
    });
  } catch (err) {
    redirect(`/admin/model-billing?error=${detail(err)}`);
  }

  expireModelBilling();
  revalidatePath('/admin/model-billing');
  revalidatePath('/admin/token-analytics');
  revalidatePath('/admin');
  redirect('/admin/model-billing?saved=1');
}
