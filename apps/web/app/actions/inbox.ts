'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { sendMessage, deleteConversation } from '@/lib/api';

/**
 * `redirect()` and `notFound()` work by throwing, and their error has no useful message — only a
 * `digest`. A `catch` that treats it as a failure turns a sign-in bounce into a dialog that says
 * nothing went wrong, which is how a reply looks sent but never reaches the API.
 */
function isControlFlow(err: unknown) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    String((err as { digest?: unknown }).digest).startsWith('NEXT_')
  );
}

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
    if (isControlFlow(err)) throw err;
    // The merchant sees a dialog; this is the only copy of why, and without it a reply that
    // never left the server leaves no trace anywhere.
    console.error(
      `[inbox] reply not sent — conversation ${conversationId} of business ${businessId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
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
