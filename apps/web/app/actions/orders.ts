'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { updateOrderState } from '@/lib/api';

export async function advanceOrderStateAction(
  businessId: string,
  orderId: string,
  nextState: string,
) {
  const token = await requireAuth();
  await updateOrderState(token, businessId, orderId, nextState);
  revalidatePath(`/b/${businessId}/orders`);
}
