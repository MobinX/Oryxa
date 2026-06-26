'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { sendMessage } from '@/lib/api';

export async function sendMessageAction(
  businessId: string,
  conversationId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const content = String(formData.get('content') ?? '').trim();
  if (!content) return;

  await sendMessage(token, businessId, conversationId, content);
  revalidatePath(`/b/${businessId}/inbox`);
}
