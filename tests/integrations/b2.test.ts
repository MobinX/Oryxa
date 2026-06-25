import { describe, it, expect, beforeEach } from 'vitest';
import {
  uploadImageToB2,
  getB2PublicUrl,
  setB2UploadOverrideForTests,
} from '@repo/integrations/b2';

describe('Backblaze B2 integration', () => {
  beforeEach(() => {
    setB2UploadOverrideForTests(async () => ({}));
    process.env.B2_KEY_ID = 'test-key-id';
    process.env.B2_APPLICATION_KEY = 'test-app-key';
    process.env.B2_BUCKET_NAME = 'oryxa-uploads';
    process.env.B2_ENDPOINT = 'https://s3.us-west-004.backblazeb2.com';
    process.env.B2_REGION = 'us-west-004';
    process.env.B2_PUBLIC_URL = 'https://cdn.example.com/oryxa-uploads';
  });

  it('uploadImageToB2 uploads and returns public URL', async () => {
    const buffer = Buffer.from('fake-image');

    const result = await uploadImageToB2({
      businessId: 'biz-123',
      buffer,
      contentType: 'image/png',
      originalName: 'shirt.png',
    });

    expect(result.key).toContain('businesses/biz-123/images/');
    expect(result.url).toBe(`https://cdn.example.com/oryxa-uploads/${result.key}`);
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

  it('getB2PublicUrl falls back to endpoint path when B2_PUBLIC_URL unset', () => {
    delete process.env.B2_PUBLIC_URL;
    expect(getB2PublicUrl('businesses/x/images/y.png')).toBe(
      'https://s3.us-west-004.backblazeb2.com/oryxa-uploads/businesses/x/images/y.png',
    );
  });
});
