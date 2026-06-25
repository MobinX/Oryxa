import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

let _client: S3Client | null = null;
let _uploadOverride: ((command: PutObjectCommand) => Promise<unknown>) | null = null;

/** @internal Test helper */
export function setB2UploadOverrideForTests(
  fn: ((command: PutObjectCommand) => Promise<unknown>) | null,
) {
  _uploadOverride = fn;
  _client = null;
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]/g, '_').slice(0, 120);
}

export function getB2PublicUrl(key: string): string {
  const publicBase = process.env.B2_PUBLIC_URL?.replace(/\/$/, '');
  if (publicBase) return `${publicBase}/${key}`;

  const endpoint = process.env.B2_ENDPOINT!.replace(/^https?:\/\//, '');
  const bucket = getBucketName();
  return `https://${endpoint}/${bucket}/${key}`;
}

export async function uploadImageToB2(params: {
  businessId: string;
  buffer: Buffer;
  contentType: string;
  originalName: string;
}): Promise<{ url: string; key: string }> {
  if (!ALLOWED_IMAGE_TYPES.has(params.contentType)) {
    throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed');
  }
  if (params.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image must be 4MB or smaller');
  }

  const key = `businesses/${params.businessId}/images/${randomUUID()}-${sanitizeFilename(params.originalName)}`;

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

  return { key, url: getB2PublicUrl(key) };
}
