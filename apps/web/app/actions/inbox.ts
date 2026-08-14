'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { sendMessage, deleteConversation } from '@/lib/api';

export async function sendMessageAction(
  businessId: string,
  conversationId: string,
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const token = await requireAuth();
  const content = String(formData.get('content') ?? '').trim();
  if (!content) return { error: 'Message cannot be empty.' };

  try {
    await sendMessage(token, businessId, conversationId, content);
    revalidatePath(`/b/${businessId}/inbox`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send message.' };
  }
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
