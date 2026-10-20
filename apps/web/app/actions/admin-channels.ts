'use server';

import { redirect } from 'next/navigation';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, connectAdminFacebookPages, getAdminFacebookAuthUrl } from '@/lib/api';

/** Starts the operator's own Facebook OAuth; the callback lands on /admin/channels/connect-facebook. */
export async function connectAdminFacebookAction() {
  const bearer = await requireConsoleBearer();
  const { url } = await getAdminFacebookAuthUrl(bearer);
  redirect(url);
}

export async function connectSelectedAdminPagesAction(
  selectionToken: string,
  formData: FormData,
) {
  const bearer = await requireConsoleBearer();
  const pageIds = formData.getAll('pageIds').map(String).filter(Boolean);
  if (pageIds.length === 0) {
    redirect(
      `/admin/channels/connect-facebook?token=${encodeURIComponent(selectionToken)}&error=no-selection`,
    );
  }

  let result;
  try {
    result = await connectAdminFacebookPages(bearer, { token: selectionToken, pageIds });
  } catch (err) {
    const detail =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Connect failed';
    // Outside the try: redirect throws its own control-flow error, which the catch would eat.
    redirect(`/admin/channels?error=connect&detail=${encodeURIComponent(detail)}`);
  }

  const failed = result.failed ?? [];
  const detail = failed.length
    ? `&failed=${failed.length}&detail=${encodeURIComponent(failed[0]?.error ?? '')}`
    : '';
  redirect(`/admin/channels?connected=${result.connected.length}${detail}`);
}
