import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { publicStoreSchema } from '@repo/shared';
import { getPublicStore } from '@repo/db/crud/store';

export const storeRouter = new OpenAPIHono();

const getStoreRoute = createRoute({
  method: 'get',
  path: '/{slug}',
  tags: ['Store'],
  request: { params: z.object({ slug: z.string().min(1).max(255) }) },
  responses: {
    200: { content: { 'application/json': { schema: publicStoreSchema } }, description: 'Public storefront' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Store not found' },
  },
});

storeRouter.openapi(getStoreRoute, async (c) => {
  const slug = c.req.param('slug');
  const store = await getPublicStore(slug);
  if (!store) return c.json({ error: 'Store not found' }, 404);
  return c.json(store);
});
