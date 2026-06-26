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
 * Uploads a variant image directly from the browser to B2:
 *   1. POST /api/uploads/sign (same-origin, sends the httpOnly auth cookie
 *      automatically) → { key, uploadUrl, previewUrl }
 *   2. PUT {uploadUrl} with the file body and Content-Type header.
 *
 * The image bytes never touch the Next.js server or the API server. The
 * returned `key` is the B2 object key that the product form submits as
 * `variant_<i>_imageKey` so the server action can persist it.
 */
export async function uploadVariantImageDirect(
  businessId: string,
  file: File,
): Promise<UploadedImage> {
  const signRes = await fetch(`/api/uploads/sign?businessId=${encodeURIComponent(businessId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      filename: file.name || 'image',
    }),
  });

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({ error: signRes.statusText }));
    throw new ImageUploadError(err.error ?? 'Sign failed', signRes.status);
  }

  const signed = (await signRes.json()) as SignedUpload;

  const putRes = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => putRes.statusText);
    throw new ImageUploadError(`Upload to B2 failed: ${text || putRes.status}`, putRes.status);
  }

  return { key: signed.key, previewUrl: signed.previewUrl };
}
