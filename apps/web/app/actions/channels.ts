'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createAgent, getFacebookAuthUrl, updateChannelAgent } from '@/lib/api';

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

export async function connectFacebookAction(businessId: string) {
  const token = await requireAuth();
  const { url } = await getFacebookAuthUrl(token, businessId);
  redirect(url);
}
