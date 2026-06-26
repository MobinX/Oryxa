'use client';

export type SignedUpload = {
  key: string;
  uploadUrl: string;
  previewUrl: string;
};

export type UploadedImage = {
  key: string;
  previewUrl: string;
};

export class ImageUploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ImageUploadError';
    this.status = status;
  }
}

/**
 * Sign an upload via the same-origin Next.js proxy (which adds the bearer
 * token from the httpOnly cookie). Returns { key, uploadUrl, previewUrl }.
 */
async function signUpload(businessId: string, file: File): Promise<SignedUpload> {
  let signRes: Response;
  try {
    signRes = await fetch(`/api/uploads/sign?businessId=${encodeURIComponent(businessId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        filename: file.name || 'image',
      }),
    });
  } catch {
    throw new ImageUploadError('Could not reach the upload service (sign step).', 0);
  }

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({ error: signRes.statusText }));
    throw new ImageUploadError(err.error ?? 'Sign failed', signRes.status);
  }

  return (await signRes.json()) as SignedUpload;
}

/**
 * Upload the file by proxying through Next.js → API → B2. Used as a fallback
 * when the browser cannot PUT directly to B2 (B2 bucket CORS not configured
 * for the current origin — common in Codespaces). Bytes flow through Next.js
 * on this path, but it works without any B2 CORS setup.
 */
async function uploadViaProxy(businessId: string, file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(`/api/uploads/image?businessId=${encodeURIComponent(businessId)}`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new ImageUploadError('Could not reach the upload service (proxy step).', 0);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ImageUploadError(err.error ?? 'Upload failed', res.status);
  }

  const data = (await res.json()) as { key: string; url: string };
  return { key: data.key, previewUrl: data.url };
}

/**
 * Uploads a variant image. Tries direct browser→B2 PUT first (fast, no bytes
 * through your servers); on network/CORS failure falls back to a proxied
 * upload through Next.js → API → B2 (works without B2 CORS configuration).
 *
 * Returns { key, previewUrl } where `key` is the B2 object key to persist.
 */
export async function uploadVariantImageDirect(
  businessId: string,
  file: File,
): Promise<UploadedImage> {
  const signed = await signUpload(businessId, file);

  try {
    const putRes = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });

    if (putRes.ok) {
      return { key: signed.key, previewUrl: signed.previewUrl };
    }
    // B2 returned an error response — fall back to the proxied upload path,
    // which uses an independent server-side upload (and a different key).
  } catch {
    // "Failed to fetch" (TypeError) — browser blocked the cross-origin PUT
    // (B2 CORS not configured) or network error. Fall back to the proxy.
  }

  return uploadViaProxy(businessId, file);
}
