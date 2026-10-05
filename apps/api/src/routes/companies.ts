import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createCompanyInputSchema,
  updateCompanyInputSchema,
  selectCompanySchema,
  listCompaniesOutputSchema,
  assignBusinessInputSchema,
  successSchema,
} from '@repo/shared';
import {
  createCompany,
  getCompanyById,
  listCompaniesByUserId,
  updateCompany,
  deleteCompany,
  listCompanyBusinesses,
  assignBusinessToCompany,
  unassignBusiness,
} from '@repo/db/crud/company';
import { authMiddleware } from '@api/middleware/auth';
import { companyAccessMiddleware } from '@api/middleware/company';

export const companiesRouter = new OpenAPIHono();

companiesRouter.use('/*', authMiddleware);
companiesRouter.use('/:id', companyAccessMiddleware);
companiesRouter.use('/:id/*', companyAccessMiddleware);

const errorSchema = z.object({ error: z.string() });

function serializeCompany<T extends { createdAt: Date }>(
  company: T,
) {
  return { ...company, createdAt: company.createdAt.toISOString() };
}

const createCompanyRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createCompanyInputSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: selectCompanySchema } }, description: 'Company created' },
  },
});

companiesRouter.openapi(createCompanyRoute, async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');
  const company = await createCompany(user.id, data);
  return c.json(serializeCompany(company), 201);
});

const listCompaniesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: listCompaniesOutputSchema } }, description: 'Companies' },
  },
});

companiesRouter.openapi(listCompaniesRoute, async (c) => {
  const user = c.get('user');
  const companies = await listCompaniesByUserId(user.id);
  return c.json({
    companies: companies.map(serializeCompany),
    totalCount: companies.length,
  });
});

const getCompanyRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: selectCompanySchema } }, description: 'Company' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

companiesRouter.openapi(getCompanyRoute, async (c) => {
  const id = c.req.param('id');
  const company = await getCompanyById(id);
  if (!company) return c.json({ error: 'Not found' }, 404);
  return c.json(serializeCompany(company));
});

const updateCompanyRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateCompanyInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: successSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

companiesRouter.openapi(updateCompanyRoute, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const data = c.req.valid('json');
  const result = await updateCompany(id, user.id, data);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

const deleteCompanyRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ deleted: z.boolean() }) } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

companiesRouter.openapi(deleteCompanyRoute, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const result = await deleteCompany(id, user.id);
  if (!result) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});

const companyBusinessesRoute = createRoute({
  method: 'get',
  path: '/{id}/businesses',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
          }),
        },
      },
      description: 'Businesses assigned to this company',
    },
  },
});

companiesRouter.openapi(companyBusinessesRoute, async (c) => {
  const id = c.req.param('id');
  const businesses = await listCompanyBusinesses(id);
  return c.json({ businesses: businesses.map((b) => ({ id: b.id, name: b.name })) });
});

const assignBusinessRoute = createRoute({
  method: 'post',
  path: '/{id}/businesses',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: assignBusinessInputSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: successSchema } }, description: 'Assigned' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Business not owned' },
  },
});

companiesRouter.openapi(assignBusinessRoute, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const { businessId } = c.req.valid('json');
  const result = await assignBusinessToCompany(id, user.id, businessId);
  if (result.error) {
    return c.json({ error: 'Business not found or access denied' }, 403);
  }
  return c.json(result);
});

const unassignBusinessRoute = createRoute({
  method: 'delete',
  path: '/{id}/businesses/{businessId}',
  tags: ['Companies'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), businessId: z.string().uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: successSchema } }, description: 'Unassigned' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

companiesRouter.openapi(unassignBusinessRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const user = c.get('user');
  const result = await unassignBusiness(businessId, user.id);
  if (result.error) return c.json({ error: 'Not found' }, 404);
  return c.json(result);
});
