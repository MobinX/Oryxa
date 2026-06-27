'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createAgent,
  updateAgent,
  deleteAgent,
  updateChannelAgent,
  deleteChannel,
  getFacebookAuthUrl,
  listFacebookPendingPages,
  connectFacebookPages,
  ApiError,
} from '@/lib/api';

export async function createAgentAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim() || 'Sales Agent';
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();

  await createAgent(token, businessId, {
    name,
    systemPrompt:
      systemPrompt ||
      'You are a friendly sales assistant. Help customers find products and place orders. Always confirm order details before creating an order.',
    platformType: 'facebook',
  });

  revalidatePath(`/b/${businessId}/channels`);
}

export async function updateAgentAction(
  businessId: string,
  agentId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  await updateAgent(token, businessId, agentId, {
    name: name || undefined,
    systemPrompt: systemPrompt || undefined,
  });
  revalidatePath(`/b/${businessId}/channels`);
}

export async function deleteAgentAction(businessId: string, agentId: string) {
  const token = await requireAuth();
  await deleteAgent(token, businessId, agentId);
  revalidatePath(`/b/${businessId}/channels`);
}

export async function deleteAgentsBulkAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('agentIds') as string[];
  await Promise.all(
    ids.map((id) => deleteAgent(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/channels`);
}

export async function updateChannelAgentAction(
  businessId: string,
  channelId: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const agentId = String(formData.get('agentId') ?? '') || null;
  await updateChannelAgent(token, businessId, channelId, agentId);
  revalidatePath(`/b/${businessId}/channels`);
}

export async function deleteChannelAction(businessId: string, channelId: string) {
  const token = await requireAuth();
  await deleteChannel(token, businessId, channelId);
  revalidatePath(`/b/${businessId}/channels`);
}

export async function deleteChannelsBulkAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('channelIds') as string[];
  await Promise.all(
    ids.map((id) => deleteChannel(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/channels`);
}

export async function connectFacebookAction(businessId: string) {
  const token = await requireAuth();
  const { url } = await getFacebookAuthUrl(token, businessId);
  redirect(url);
}

export async function connectSelectedFacebookPagesAction(
  businessId: string,
  selectionToken: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const pageIds = formData.getAll('pageIds').map(String).filter(Boolean);
  if (pageIds.length === 0) {
    redirect(`/b/${businessId}/channels/connect-facebook?token=${encodeURIComponent(selectionToken)}&error=no-selection`);
  }

  let result;
  try {
    result = await connectFacebookPages(token, businessId, { token: selectionToken, pageIds });
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Connect failed';
    redirect(
      `/b/${businessId}/channels?error=facebook-subscribe&detail=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath(`/b/${businessId}/channels`);
  const failed = result.failed ?? [];

  if (result.connected.length === 0 && failed.length > 0) {
    const detail = encodeURIComponent(failed[0]?.error ?? 'Connect failed');
    redirect(`/b/${businessId}/channels?error=facebook-subscribe&detail=${detail}`);
  }

  if (failed.length > 0) {
    const subscribeDetail = encodeURIComponent(failed[0]?.error ?? '');
    redirect(
      `/b/${businessId}/channels?connected=facebook&subscribeFailed=${failed.length}&subscribeDetail=${subscribeDetail}`,
    );
  }

  redirect(`/b/${businessId}/channels?connected=facebook`);
}
