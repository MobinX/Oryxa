import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 300;

let _client: S3Client | null = null;
let _uploadOverride: ((command: PutObjectCommand) => Promise<unknown>) | null = null;
let _signedUrlOverride: ((key: string) => Promise<string>) | null = null;
let _signedUploadUrlOverride: ((key: string, contentType: string) => Promise<string>) | null = null;

/** @internal Test helper */
export function setB2UploadOverrideForTests(
  fn: ((command: PutObjectCommand) => Promise<unknown>) | null,
) {
  _uploadOverride = fn;
  _client = null;
}

/** @internal Test helper */
export function setB2SignedUrlOverrideForTests(fn: ((key: string) => Promise<string>) | null) {
  _signedUrlOverride = fn;
}

/** @internal Test helper — stubs the presigned PUT URL generator. */
export function setB2SignedUploadUrlOverrideForTests(
  fn: ((key: string, contentType: string) => Promise<string>) | null,
) {
  _signedUploadUrlOverride = fn;
}

function getB2Client(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Backblaze B2 is not configured (B2_ENDPOINT, B2_REGION, B2_KEY_ID, B2_APPLICATION_KEY)');
  }

  _client = new S3Client({
    endpoint: endpoint.startsWith('https://') ? endpoint : `https://${endpoint}`,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  return _client;
}

function getBucketName(): string {
  const bucket = process.env.B2_BUCKET_NAME;
  if (!bucket) throw new Error('B2_BUCKET_NAME is not set');
  return bucket;
}

function getSignedUrlTtlSeconds(): number {
  const raw = process.env.B2_SIGNED_URL_TTL_SECONDS;
  if (!raw) return DEFAULT_SIGNED_URL_TTL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SIGNED_URL_TTL_SECONDS;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]/g, '_').slice(0, 120);
}

export function isB2ObjectKey(value: string): boolean {
  return !value.startsWith('http://') && !value.startsWith('https://');
}

export function assertB2KeyForBusiness(key: string, businessId: string): void {
  const prefix = `businesses/${businessId}/`;
  if (!key.startsWith(prefix)) {
    throw new Error('Invalid image key for this business');
  }
}

/** Builds the canonical B2 object key for a variant image. */
export function buildVariantImageKey(businessId: string, originalName: string): string {
  return `businesses/${businessId}/images/${randomUUID()}-${sanitizeFilename(originalName)}`;
}

export async function getSignedB2Url(key: string, expiresInSeconds = getSignedUrlTtlSeconds()): Promise<string> {
  if (_signedUrlOverride) {
    return _signedUrlOverride(key);
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  return getSignedUrl(getB2Client(), command, { expiresIn: expiresInSeconds });
}

/**
 * Returns a presigned PUT URL the browser can use to upload an object directly
 * to B2. The `contentType` is bound into the signature — a PUT with a different
 * Content-Type header will be rejected by B2, preventing MIME spoofing.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = DEFAULT_UPLOAD_URL_TTL_SECONDS,
): Promise<string> {
  if (_signedUploadUrlOverride) {
    return _signedUploadUrlOverride(key, contentType);
  }

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getB2Client(), command, { expiresIn: expiresInSeconds });
}

export async function resolveStoredImageUrl(
  stored: string | null | undefined,
): Promise<string | undefined> {
  if (!stored) return undefined;
  if (!isB2ObjectKey(stored)) return stored;
  return getSignedB2Url(stored);
}

export function validateImageUpload(contentType: string, sizeBytes: number): void {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed');
  }
  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error('Image must be 4MB or smaller');
  }
}

export async function uploadImageToB2(params: {
  businessId: string;
  buffer: Buffer;
  contentType: string;
  originalName: string;
}): Promise<{ key: string; url: string }> {
  validateImageUpload(params.contentType, params.buffer.byteLength);

  const key = buildVariantImageKey(params.businessId, params.originalName);

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: params.buffer,
    ContentType: params.contentType,
  });

  if (_uploadOverride) {
    await _uploadOverride(command);
  } else {
    await getB2Client().send(command);
  }

  const url = await getSignedB2Url(key);
  return { key, url };
}
