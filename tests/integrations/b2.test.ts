import { describe, it, expect, beforeEach } from 'vitest';
import {
  uploadImageToB2,
  getSignedB2Url,
  resolveStoredImageUrl,
  isB2ObjectKey,
  setB2UploadOverrideForTests,
  setB2SignedUrlOverrideForTests,
} from '@repo/integrations/b2';

describe('Backblaze B2 integration', () => {
  beforeEach(() => {
    setB2UploadOverrideForTests(async () => ({}));
    setB2SignedUrlOverrideForTests(async (key) => `https://signed.example.com/${key}?sig=test`);
    process.env.B2_KEY_ID = 'test-key-id';
    process.env.B2_APPLICATION_KEY = 'test-app-key';
    process.env.B2_BUCKET_NAME = 'oryxa-uploads';
    process.env.B2_ENDPOINT = 'https://s3.us-east-005.backblazeb2.com';
    process.env.B2_REGION = 'us-east-005';
    process.env.B2_SIGNED_URL_TTL_SECONDS = '3600';
  });

  it('uploadImageToB2 returns object key and signed preview URL', async () => {
    const buffer = Buffer.from('fake-image');

    const result = await uploadImageToB2({
      businessId: 'biz-123',
      buffer,
      contentType: 'image/png',
      originalName: 'shirt.png',
    });

    expect(result.key).toContain('businesses/biz-123/images/');
    expect(result.url).toContain('https://signed.example.com/');
  });

  it('resolveStoredImageUrl signs B2 keys and passes through http URLs', async () => {
    expect(isB2ObjectKey('businesses/x/images/a.png')).toBe(true);
    expect(isB2ObjectKey('https://cdn.example.com/a.png')).toBe(false);

    const signed = await resolveStoredImageUrl('businesses/x/images/a.png');
    expect(signed).toContain('https://signed.example.com/businesses/x/images/a.png');

    const legacy = await resolveStoredImageUrl('https://cdn.example.com/a.png');
    expect(legacy).toBe('https://cdn.example.com/a.png');
  });

  it('getSignedB2Url returns presigned URL', async () => {
    const url = await getSignedB2Url('businesses/biz/images/file.png');
    expect(url).toContain('https://signed.example.com/businesses/biz/images/file.png');
  });

  it('rejects unsupported file types', async () => {
    await expect(
      uploadImageToB2({
        businessId: 'biz-123',
        buffer: Buffer.from('text'),
        contentType: 'text/plain',
        originalName: 'notes.txt',
      }),
    ).rejects.toThrow('Only JPEG');
  });
});
