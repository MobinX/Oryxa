import { OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import {
  uploadImageToB2,
  getSignedB2Url,
  getSignedUploadUrl,
  buildVariantImageKey,
  assertB2KeyForBusiness,
  validateImageUpload,
  MAX_IMAGE_BYTES,
} from '@repo/integrations/b2';

export const uploadsRouter = new OpenAPIHono();

uploadsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

uploadsRouter.post('/:businessId/uploads/image', async (c) => {
  try {
    const businessId = c.req.param('businessId');
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file provided' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImageToB2({
      businessId,
      buffer,
      contentType: file.type || 'application/octet-stream',
      originalName: file.name || 'image',
    });

    return c.json({ key: result.key, url: result.url }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    const status = message.includes('not configured') ? 503 : 400;
    return c.json({ error: message }, status);
  }
});

const signUploadBodySchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  filename: z.string().max(255).default('image'),
});

/**
 * Returns a presigned PUT URL the browser can use to upload an image directly
 * to B2, plus a presigned GET URL for previewing the not-yet-uploaded object.
 * The browser PUTs the bytes to `uploadUrl` with `Content-Type: contentType`;
 * any other Content-Type is rejected by B2 because it isn't in the signature.
 */
uploadsRouter.post('/:businessId/uploads/sign', async (c) => {
  try {
    const businessId = c.req.param('businessId');
    let parsed;
    try {
      parsed = signUploadBodySchema.parse(await c.req.json());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      return c.json({ error: message }, 400);
    }

    validateImageUpload(parsed.contentType, parsed.size);

    const key = buildVariantImageKey(businessId, parsed.filename);
    const uploadUrl = await getSignedUploadUrl(key, parsed.contentType);
    const previewUrl = await getSignedB2Url(key);

    return c.json({ key, uploadUrl, previewUrl }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign failed';
    const status = message.includes('not configured') ? 503 : 400;
    return c.json({ error: message }, status);
  }
});

uploadsRouter.get('/:businessId/uploads/signed', async (c) => {
  try {
    const businessId = c.req.param('businessId');
    const key = c.req.query('key');
    if (!key) return c.json({ error: 'key query parameter is required' }, 400);

    assertB2KeyForBusiness(key, businessId);
    const url = await getSignedB2Url(key);
    return c.json({ key, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign URL';
    return c.json({ error: message }, 400);
  }
});
