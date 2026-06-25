import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createProductBodySchema,
  createProductOutputSchema,
  getProductByIdOutputSchema,
  listProductsOutputSchema,
  listProductsQuerySchema,
  updateProductInputSchema,
  updateProductOutputSchema,
  deleteProductOutputSchema,
  createCategoryInputSchema,
  selectCategorySchema,
} from '@repo/shared';
import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
  createCategory,
  listCategories,
} from '@repo/db/crud/product';
import { authMiddleware } from '../middleware/auth';
import { businessAccessMiddleware } from '../middleware/business';

export const productsRouter = new OpenAPIHono();

productsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/{businessId}/categories',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createCategoryInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: selectCategorySchema } }, description: 'Category created' },
  },
});

productsRouter.openapi(createCategoryRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { name } = c.req.valid('json');
  const cat = await createCategory(businessId, name);
  return c.json(cat, 201);
});

const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/{businessId}/categories',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }) },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(selectCategorySchema) } },
      description: 'Categories',
    },
  },
});

productsRouter.openapi(listCategoriesRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const cats = await listCategories(businessId);
  return c.json(cats);
});

const createProductRoute = createRoute({
  method: 'post',
  path: '/{businessId}/products',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: createProductBodySchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: createProductOutputSchema } }, description: 'Product created' },
  },
});

productsRouter.openapi(createProductRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  const product = await createProduct({ ...data, businessId });
  return c.json(product, 201);
});

const listProductsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/products',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: listProductsQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: listProductsOutputSchema } }, description: 'Products' },
  },
});

productsRouter.openapi(listProductsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const query = c.req.valid('query');
  const result = await listProducts(businessId, query);
  return c.json({
    products: result.products.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    totalCount: result.totalCount,
  });
});

const getProductRoute = createRoute({
  method: 'get',
  path: '/{businessId}/products/{productId}',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), productId: z.string().uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: getProductByIdOutputSchema } }, description: 'Product' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

productsRouter.openapi(getProductRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const productId = c.req.param('productId');
  const product = await getProductById(businessId, productId);
  if (!product) return c.json({ error: 'Product entity missing' }, 404);
  return c.json({
    ...product,
    createdAt: product.createdAt.toISOString(),
  });
});

const updateProductRoute = createRoute({
  method: 'put',
  path: '/{businessId}/products/{productId}',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), productId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateProductInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: updateProductOutputSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

productsRouter.openapi(updateProductRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const productId = c.req.param('productId');
  const data = c.req.valid('json');
  const result = await updateProduct(businessId, productId, data);
  if (!result) return c.json({ error: 'Product entity missing' }, 404);
  return c.json(result);
});

const deleteProductRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/products/{productId}',
  tags: ['Catalog'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid(), productId: z.string().uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: deleteProductOutputSchema } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

productsRouter.openapi(deleteProductRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const productId = c.req.param('productId');
  const result = await deleteProduct(businessId, productId);
  if (!result) return c.json({ error: 'Product entity missing' }, 404);
  return c.json(result);
});
