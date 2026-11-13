import { describe, it, expect, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders, TEST_AUTH_TOKEN } from '../helpers/seed';
import { app } from '@api/app';
import {
  setB2SignedUrlOverrideForTests,
  setB2SignedUploadUrlOverrideForTests,
  setB2UploadOverrideForTests,
} from '@repo/integrations/b2';

describe('Uploads API', () => {
  withPglite();
  let uploadedCommands: any[] = [];

  beforeEach(() => {
    uploadedCommands = [];
    setB2UploadOverrideForTests(async (cmd) => {
      uploadedCommands.push(cmd);
      return {};
    });
    setB2SignedUrlOverrideForTests(async (key) => `https://signed.example.com/${key}?sig=get`);
    setB2SignedUploadUrlOverrideForTests(
      async (key, contentType) =>
        `https://signed.example.com/${key}?sig=put&ct=${encodeURIComponent(contentType)}`,
    );
    process.env.B2_KEY_ID = 'test-key-id';
    process.env.B2_APPLICATION_KEY = 'test-app-key';
    process.env.B2_BUCKET_NAME = 'oryxa-uploads';
    process.env.B2_ENDPOINT = 'https://s3.us-east-005.backblazeb2.com';
    process.env.B2_REGION = 'us-east-005';
  });

  it('POST /:businessId/uploads/sign returns key, uploadUrl, previewUrl', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/uploads/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        contentType: 'image/png',
        size: 1024,
        filename: 'shirt.png',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.key).toContain(`businesses/${business.id}/images/`);
    expect(body.key).toContain('shirt.png');
    expect(body.uploadUrl).toContain('sig=put');
    expect(body.uploadUrl).toContain('image%2Fpng');
    expect(body.previewUrl).toContain('sig=get');
  });

  it('rejects unsupported content type', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/uploads/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ contentType: 'text/plain', size: 100, filename: 'a.txt' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/Only JPEG/);
  });

  it('rejects oversize uploads', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/uploads/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        contentType: 'image/png',
        size: 5 * 1024 * 1024,
        filename: 'big.png',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/uploads/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/png', size: 100, filename: 'a.png' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid body', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/uploads/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ contentType: 'image/png' }),
    });
    expect(res.status).toBe(400);
  });

  describe('POST /:businessId/uploads/image', () => {
    it('sniffs contentType from magic bytes for application/octet-stream', async () => {
      const { business } = await seedTestWorld();
      const formData = new FormData();
      // JPEG magic bytes: 0xFF, 0xD8, 0xFF
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const file = new File([jpegBytes], 'photo_from_gallery', { type: 'application/octet-stream' });
      formData.append('file', file);

      const res = await app.request(`/api/v1/${business.id}/uploads/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_AUTH_TOKEN}` },
        body: formData,
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.key).toContain(`businesses/${business.id}/images/`);
      expect(body.url).toContain('https://signed.example.com/');
      expect(uploadedCommands.length).toBe(1);
      expect(uploadedCommands[0].input.ContentType).toBe('image/jpeg');
    });

    it('sniffs contentType from extension when magic bytes are absent or unknown', async () => {
      const { business } = await seedTestWorld();
      const formData = new FormData();
      const dummyBytes = new Uint8Array([1, 2, 3, 4]);
      const file = new File([dummyBytes], 'sample.png', { type: 'application/octet-stream' });
      formData.append('file', file);

      const res = await app.request(`/api/v1/${business.id}/uploads/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_AUTH_TOKEN}` },
        body: formData,
      });

      expect(res.status).toBe(201);
      expect(uploadedCommands.length).toBe(1);
      expect(uploadedCommands[0].input.ContentType).toBe('image/png');
    });

    it('rejects file if neither magic bytes nor extension match allowed images', async () => {
      const { business } = await seedTestWorld();
      const formData = new FormData();
      const dummyBytes = new Uint8Array([1, 2, 3, 4]);
      const file = new File([dummyBytes], 'test.txt', { type: 'application/octet-stream' });
      formData.append('file', file);

      const res = await app.request(`/api/v1/${business.id}/uploads/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_AUTH_TOKEN}` },
        body: formData,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain('Only JPEG, PNG, WebP, and GIF images are allowed');
    });
  });
});
