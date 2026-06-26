'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { sendMessage, deleteConversation } from '@/lib/api';

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

export async function deleteConversationAction(
  businessId: string,
  conversationId: string,
) {
  const token = await requireAuth();
  await deleteConversation(token, businessId, conversationId);
  revalidatePath(`/b/${businessId}/inbox`);
}

export async function deleteConversationsBulkAction(
  businessId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const ids = formData.getAll('conversationIds') as string[];
  await Promise.all(
    ids.map((id) => deleteConversation(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/inbox`);
}
