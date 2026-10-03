import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  publicStoreSchema,
  publicStoreProductSchema,
  storeProductsQuerySchema,
  checkoutInputSchema,
  checkoutOutputSchema,
} from '@repo/shared';
import {
  getPublicStore,
  getPublicProduct,
  createPublicCheckout,
  CheckoutError,
} from '@repo/db/crud/store';

export const storeRouter = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });
const slugParams = z.object({ slug: z.string().min(1).max(255) });

const getStoreRoute = createRoute({
  method: 'get',
  path: '/{slug}',
  tags: ['Store'],
  request: { params: slugParams, query: storeProductsQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: publicStoreSchema } }, description: 'Public storefront' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Store not found' },
  },
});

storeRouter.openapi(getStoreRoute, async (c) => {
  const slug = c.req.param('slug');
  const { q, category, sort, min, max } = c.req.valid('query');
  const store = await getPublicStore(slug, { q, category, sort, min, max });
  if (!store) return c.json({ error: 'Store not found' }, 404);
  return c.json(store);
});

const getProductRoute = createRoute({
  method: 'get',
  path: '/{slug}/products/{productId}',
  tags: ['Store'],
  request: { params: z.object({ slug: z.string().min(1).max(255), productId: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: publicStoreProductSchema } }, description: 'Product' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

storeRouter.openapi(getProductRoute, async (c) => {
  const slug = c.req.param('slug');
  const productId = c.req.param('productId');
  const product = await getPublicProduct(slug, productId);
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(product);
});

const checkoutRoute = createRoute({
  method: 'post',
  path: '/{slug}/checkout',
  tags: ['Store'],
  request: {
    params: slugParams,
    body: { content: { 'application/json': { schema: checkoutInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: checkoutOutputSchema } }, description: 'Order placed' },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Checkout failed' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Store not found' },
  },
});

storeRouter.openapi(checkoutRoute, async (c) => {
  const slug = c.req.param('slug');
  const body = c.req.valid('json');
  try {
    const result = await createPublicCheckout(slug, body);
    if (!result) return c.json({ error: 'Store not found' }, 404);
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof CheckoutError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
