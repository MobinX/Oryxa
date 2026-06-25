import { OpenAPIHono } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import { uploadImageToB2 } from '@repo/integrations/b2';

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

    return c.json({ url: result.url, key: result.key }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    const status = message.includes('not configured') ? 503 : 400;
    return c.json({ error: message }, status);
  }
});
