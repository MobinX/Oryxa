import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createCustomerInputSchema,
  updateCustomerInputSchema,
  selectCustomerSchema,
  listCustomersOutputSchema,
  listCustomersQuerySchema,
  successSchema,
} from '@repo/shared';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCompanyIdForBusiness,
} from '@repo/db/crud/customer';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

export const customersRouter = new OpenAPIHono();

customersRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const errorSchema = z.object({ error: z.string() });
const NO_COMPANY_ERROR = 'Business is not linked to a company';
const paramsSchema = z.object({ businessId: z.string().uuid() });

function serializeCustomer<T extends { createdAt: Date }>(customer: T) {
  return { ...customer, createdAt: customer.createdAt.toISOString() };
}

const listCustomersRoute = createRoute({
  method: 'get',
  path: '/{businessId}/customers',
  tags: ['Customers'],
  security: [{ bearerAuth: [] }],
  request: {
    params: paramsSchema,
    query: listCustomersQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: listCustomersOutputSchema } }, description: 'Customers' },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Business has no company' },
  },
});

customersRouter.openapi(listCustomersRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const query = c.req.valid('query');
  const companyId = await getCompanyIdForBusiness(businessId);
  if (!companyId) return c.json({ error: NO_COMPANY_ERROR }, 400);

  const result = await listCustomers(companyId, query);
  return c.json({
    customers: result.customers.map(serializeCustomer),
    totalCount: result.totalCount,
  });
});

const createCustomerRoute = createRoute({
  method: 'post',
  path: '/{businessId}/customers',
  tags: ['Customers'],
  security: [{ bearerAuth: [] }],
  request: {
    params: paramsSchema,
    body: { content: { 'application/json': { schema: createCustomerInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: selectCustomerSchema } }, description: 'Customer created' },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Business has no company' },
  },
});

customersRouter.openapi(createCustomerRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const data = c.req.valid('json');
  const companyId = await getCompanyIdForBusiness(businessId);
  if (!companyId) return c.json({ error: NO_COMPANY_ERROR }, 400);

  const customer = await createCustomer(companyId, data);
  return c.json(serializeCustomer(customer), 201);
});

const customerParamsSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid(),
});

const updateCustomerRoute = createRoute({
  method: 'put',
  path: '/{businessId}/customers/{customerId}',
  tags: ['Customers'],
  security: [{ bearerAuth: [] }],
  request: {
    params: customerParamsSchema,
    body: { content: { 'application/json': { schema: updateCustomerInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: successSchema } }, description: 'Updated' },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Business has no company' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

customersRouter.openapi(updateCustomerRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const customerId = c.req.param('customerId');
  const data = c.req.valid('json');
  const companyId = await getCompanyIdForBusiness(businessId);
  if (!companyId) return c.json({ error: NO_COMPANY_ERROR }, 400);

  const result = await updateCustomer(customerId, companyId, data);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

const deleteCustomerRoute = createRoute({
  method: 'delete',
  path: '/{businessId}/customers/{customerId}',
  tags: ['Customers'],
  security: [{ bearerAuth: [] }],
  request: { params: customerParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ deleted: z.boolean() }) } }, description: 'Deleted' },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'Business has no company' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

customersRouter.openapi(deleteCustomerRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const customerId = c.req.param('customerId');
  const companyId = await getCompanyIdForBusiness(businessId);
  if (!companyId) return c.json({ error: NO_COMPANY_ERROR }, 400);

  const result = await deleteCustomer(customerId, companyId);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});
