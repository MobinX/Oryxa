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
 *
 * Step 2 goes through `XMLHttpRequest` rather than `fetch` because the form has
 * to show how far the upload actually got: `fetch` reports nothing while the
 * request body is being sent, and a large photo over a slow connection would
 * otherwise look like a hang.
 */
export async function uploadVariantImageDirect(
  businessId: string,
  file: File,
  onProgress?: (percent: number) => void,
  token?: string,
): Promise<UploadedImage> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const signRes = await fetch(`/api/uploads/sign?businessId=${encodeURIComponent(businessId)}`, {
    method: 'POST',
    headers,
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

  await putToStorage(signed.uploadUrl, file, onProgress);

  return { key: signed.key, previewUrl: signed.previewUrl };
}

function putToStorage(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new ImageUploadError(`Upload to B2 failed: ${xhr.responseText || xhr.statusText || xhr.status}`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ImageUploadError('Upload to B2 failed: network error', 0));
    xhr.onabort = () => reject(new ImageUploadError('Upload cancelled', 0));

    xhr.send(file);
  });
}
