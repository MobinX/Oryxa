'use server';

import { redirect } from 'next/navigation';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, connectAdminWhatsapp } from '@/lib/api';

/** Connect a WhatsApp Cloud API phone number (token never leaves the server; stored encrypted). */
export async function connectAdminWhatsappAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const token = String(formData.get('token') ?? '').trim();
  const phoneNumberId = String(formData.get('phoneNumberId') ?? '').trim();
  const businessId = String(formData.get('businessId') ?? '').trim();

  if (!token || !phoneNumberId || !businessId) {
    const detail = encodeURIComponent('token, phoneNumberId and businessId are all required');
    redirect(`/admin/channels?error=whatsapp&detail=${detail}`);
  }

  try {
    await connectAdminWhatsapp(bearer, { token, phoneNumberId, businessId });
  } catch (err) {
    const detail =
      err instanceof ApiError
        ? `${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Connect failed';
    redirect(`/admin/channels?error=whatsapp&detail=${encodeURIComponent(detail)}`);
  }

  redirect('/admin/channels?connectedWa=1');
}

/** Health-check a channel's stored token (verify endpoint). */
export async function verifyAdminChannelAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const channelId = String(formData.get('channelId') ?? '');
  const label = String(formData.get('label') ?? 'channel');
  if (!channelId) {
    redirect('/admin/channels?error=verify&detail=missing-channelId');
  }

  const { verifyAdminAiChannel } = await import('@/lib/api');
  let verifyError: string | null = null;
  try {
    const result = await verifyAdminAiChannel(bearer, channelId);
    if (!result.verified) {
      verifyError = result.error ?? 'not verified';
    }
  } catch (err) {
    verifyError =
      err instanceof ApiError
        ? `${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Verify failed';
  }

  // Outside the try: redirect throws its own control-flow error, which the catch would eat.
  if (verifyError) {
    redirect(`/admin/channels?error=verify&detail=${encodeURIComponent(verifyError)}`);
  }
  redirect(`/admin/channels?verifiedWa=${encodeURIComponent(label)}`);
}
