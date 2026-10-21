'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireChannelPage } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import {
  deleteChannel,
  getFacebookAuthUrl,
  getInstagramAuthUrl,
  connectFacebookPages,
  connectInstagramAccounts,
  ApiError,
} from '@/lib/api';

export async function deleteChannelAction(businessId: string, channelId: string) {
  const token = await requireAuth();
  await deleteChannel(token, businessId, channelId);
  revalidatePath(`/b/${businessId}/channels`);
  expireChannelPage(businessId);
  redirect(`/b/${businessId}/channels?deleted=facebook`);
}

export async function deleteChannelsBulkAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('channelIds') as string[];
  await Promise.all(
    ids.map((id) => deleteChannel(token, businessId, id).catch(() => null)),
  );
  revalidatePath(`/b/${businessId}/channels`);
  expireChannelPage(businessId);
  redirect(`/b/${businessId}/channels?deleted=facebook`);
}

export async function connectFacebookAction(businessId: string, portfolio?: boolean) {
  const token = await requireAuth();
  const { url } = await getFacebookAuthUrl(token, businessId, { portfolio });
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
  expireChannelPage(businessId);
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

export async function connectInstagramAction(businessId: string) {
  const token = await requireAuth();
  const { url } = await getInstagramAuthUrl(token, businessId);
  redirect(url);
}

export async function connectSelectedInstagramAccountsAction(
  businessId: string,
  selectionToken: string,
  formData: FormData,
) {
  const token = await requireAuth();
  const accountIds = formData.getAll('accountIds').map(String).filter(Boolean);
  if (accountIds.length === 0) {
    redirect(
      `/b/${businessId}/channels/connect-instagram?token=${encodeURIComponent(selectionToken)}&error=no-selection`,
    );
  }

  let result;
  try {
    result = await connectInstagramAccounts(token, businessId, {
      token: selectionToken,
      accountIds,
    });
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Connect failed';
    redirect(
      `/b/${businessId}/channels?error=instagram-connect&detail=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath(`/b/${businessId}/channels`);
  expireChannelPage(businessId);
  const failed = result.failed ?? [];

  if (result.connected.length === 0 && failed.length > 0) {
    redirect(
      `/b/${businessId}/channels?error=instagram-connect&detail=${encodeURIComponent(failed[0]?.error ?? 'Connect failed')}`,
    );
  }

  if (failed.length > 0) {
    redirect(
      `/b/${businessId}/channels?connected=instagram&subscribeFailed=${failed.length}&subscribeDetail=${encodeURIComponent(failed[0]?.error ?? '')}`,
    );
  }

  redirect(`/b/${businessId}/channels?connected=instagram`);
}
