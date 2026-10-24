'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  sendMessage,
  deleteConversation,
  updateConversationState,
  listMessages,
  updateConversationAutoPilot,
  generateInboxSuggestions,
  sendInboxSuggestion,
  createConversationOrder,
  listProducts,
  listCategories,
  getProduct,
} from '@/lib/api';

export type InboxMessage = Awaited<ReturnType<typeof listMessages>>[number];

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

export async function sendInboxReplyAction(
  businessId: string,
  conversationId: string,
  content: string,
): Promise<{ error: string | null }> {
  const token = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) return { error: 'Message cannot be empty.' };
  try {
    await sendMessage(token, businessId, conversationId, trimmed);
    revalidatePath(`/b/${businessId}/inbox`);
    return { error: null };
  } catch (err) {
    if (isControlFlow(err)) throw err;
    return { error: err instanceof Error ? err.message : 'Failed to send message.' };
  }
}

/** Polled by the open thread every five seconds; returns the latest page of messages. */
export async function pollInboxMessagesAction(
  businessId: string,
  conversationId: string,
): Promise<InboxMessage[]> {
  const token = await requireAuth();
  return listMessages(token, businessId, conversationId);
}

export async function setAutoPilotAction(
  businessId: string,
  conversationId: string,
  autoPilot: boolean,
): Promise<{ autoPilot: boolean }> {
  const token = await requireAuth();
  const result = await updateConversationAutoPilot(token, businessId, conversationId, autoPilot);
  revalidatePath(`/b/${businessId}/inbox`);
  return { autoPilot: result.autoPilot };
}

export async function generateSuggestionsAction(
  businessId: string,
  conversationId: string,
) {
  const token = await requireAuth();
  return generateInboxSuggestions(token, businessId, conversationId);
}

export async function sendInboxSuggestionAction(
  businessId: string,
  conversationId: string,
  input: Parameters<typeof sendInboxSuggestion>[3],
): Promise<{ error: string | null }> {
  const token = await requireAuth();
  try {
    await sendInboxSuggestion(token, businessId, conversationId, input);
    revalidatePath(`/b/${businessId}/inbox`);
    return { error: null };
  } catch (err) {
    if (isControlFlow(err)) throw err;
    return { error: err instanceof Error ? err.message : 'Could not send this suggestion.' };
  }
}

export async function searchInboxProductsAction(businessId: string, query: string) {
  const token = await requireAuth();
  const result = await listProducts(token, businessId, { q: query.trim() || undefined, limit: 20 });
  return result.products;
}

export async function listInboxCategoriesAction(businessId: string) {
  const token = await requireAuth();
  return listCategories(token, businessId);
}

export async function getInboxProductAction(businessId: string, productId: string) {
  const token = await requireAuth();
  return getProduct(token, businessId, productId);
}

export async function createInboxOrderAction(
  businessId: string,
  conversationId: string,
  input: Parameters<typeof createConversationOrder>[3],
): Promise<{ error: string | null; id?: string; totalPrice?: number }> {
  const token = await requireAuth();
  try {
    const order = await createConversationOrder(token, businessId, conversationId, input);
    revalidatePath(`/b/${businessId}/inbox`);
    revalidatePath(`/b/${businessId}/orders`);
    return { error: null, id: order.id, totalPrice: order.totalPrice };
  } catch (err) {
    if (isControlFlow(err)) throw err;
    return { error: err instanceof Error ? err.message : 'Could not create the order.' };
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

export async function updateConversationStateAction(
  businessId: string,
  conversationId: string,
  state: 'pending' | 'working' | 'done',
) {
  const token = await requireAuth();
  await updateConversationState(token, businessId, conversationId, state);
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
