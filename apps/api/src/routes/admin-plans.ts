import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  adminBusinessPlanSchema,
  adminPlanEditResultSchema,
  adminPlanRowSchema,
  assignPlanInputSchema,
  createPlanInputSchema,
  deletePlanConflictSchema,
  errorSchema,
  planAssignmentSchema,
  quotaStatusSchema,
  updatePlanInputSchema,
  type AdminPlanEditResult,
  type AdminPlanRow,
  type Plan,
  type QuotaKind,
} from '@repo/shared';
import { ensureQuotaNotice, ensurePlanNotices, getQuotaStatus } from '@repo/db/crud/billing';
import {
  assignPlan,
  countBusinessesOnPlans,
  createPlan,
  deletePlan,
  getPlanById,
  getPlanBySlug,
  listAdminBusinessPlans,
  listAdminPlans,
  listAssignments,
  resetCycle,
  updatePlan,
} from '@repo/db/crud/plans';
import { logsAuthMiddleware } from '@api/middleware/logs-access';

/**
 * The operator's plan console: the catalogue, and who is on what.
 *
 * Same gate as the dashboard and the log console — the console password or an allowlisted
 * account — because it is the same audience. It is not on `/api/v1`: nothing here is
 * scoped to one business, and a merchant must never be able to edit the plan that limits
 * them.
 *
 * Editing a plan is a fleet-wide action. Limits are read from `plans` at gate time and
 * never copied onto a business, so a save is live for every business on it from the next
 * inbound message. That is also why `businessCount` rides on every row and why a
 * tightened cap writes its merchants' notices inside this request — there is no cron that
 * could do it later.
 */
export const adminPlansRouter = new OpenAPIHono({
  defaultHook: (result, c) =>
    result.success ? undefined : c.json({ error: 'Invalid plan input' }, 400),
});

adminPlansRouter.use('*', logsAuthMiddleware);

const planParams = z.object({ id: z.string().uuid() });
const businessParams = z.object({ businessId: z.string().uuid() });

/**
 * An edit that made a budget smaller than it was, including one that made it exist at
 * all. Anything else — a raise, a rename, a price — cannot strand a business, so it
 * cannot generate a notice.
 */
function tightened(previous: number | null, next: number | null): number | null {
  return next !== null && (previous === null || next < previous) ? next : null;
}

const listPlansRoute = createRoute({
  method: 'get',
  path: '/admin/plans',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(adminPlanRowSchema) } },
      description: 'Every plan that has not been deleted, retired ones included, with how many businesses each holds',
    },
  },
});

adminPlansRouter.openapi(listPlansRoute, async (c) => c.json(await listAdminPlans(), 200));

const createPlanRoute = createRoute({
  method: 'post',
  path: '/admin/plans',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createPlanInputSchema } } } },
  responses: {
    200: {
      content: { 'application/json': { schema: adminPlanEditResultSchema } },
      description: 'The new plan. Nothing is on it yet, so nothing is notified.',
    },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'That slug is taken' },
  },
});

adminPlansRouter.openapi(createPlanRoute, async (c) => {
  const body = c.req.valid('json');
  const taken = await getPlanBySlug(body.slug);
  if (taken) return c.json({ error: `A plan with the slug "${body.slug}" already exists` }, 409);

  const created = await createPlan(body);
  const row: AdminPlanRow = { ...created, businessCount: 0 };
  return c.json({ plan: row, notified: 0 } satisfies AdminPlanEditResult, 200);
});

const updatePlanRoute = createRoute({
  method: 'patch',
  path: '/admin/plans/{id}',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: {
    params: planParams,
    body: { content: { 'application/json': { schema: updatePlanInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: adminPlanEditResultSchema } },
      description: 'The saved plan, and how many businesses this edit just crossed a threshold for',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such plan' },
  },
});

adminPlansRouter.openapi(updatePlanRoute, async (c) => {
  const id = c.req.param('id');
  // Read before the write: the only way to know whether a cap was tightened is the number
  // that was there a moment ago.
  const previous = await getPlanById(id);
  if (!previous) return c.json({ error: 'Plan not found' }, 404);

  const saved = await updatePlan(id, c.req.valid('json'));
  if (!saved) return c.json({ error: 'Plan not found' }, 404);

  const caps: { kind: QuotaKind; limit: number }[] = [];
  const messages = tightened(previous.messageLimit, saved.messageLimit);
  const comments = tightened(previous.commentLimit, saved.commentLimit);
  if (messages !== null) caps.push({ kind: 'message', limit: messages });
  if (comments !== null) caps.push({ kind: 'comment', limit: comments });
  const notified = await ensurePlanNotices(saved.id, caps);

  const counts = await countBusinessesOnPlans([saved.id]);
  const row: AdminPlanRow = { ...saved, businessCount: counts.get(saved.id) ?? 0 };
  return c.json({ plan: row, notified } satisfies AdminPlanEditResult, 200);
});

const deletePlanRoute = createRoute({
  method: 'delete',
  path: '/admin/plans/{id}',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { params: planParams },
  responses: {
    204: { description: 'Deleted. Only a plan nobody is on can be deleted.' },
    409: {
      content: { 'application/json': { schema: deletePlanConflictSchema } },
      description: 'Businesses are still on it — the list is who',
    },
  },
});

adminPlansRouter.openapi(deletePlanRoute, async (c) => {
  const result = await deletePlan(c.req.param('id'));
  if (!('conflict' in result)) return c.body(null, 204);

  return c.json(
    {
      error:
        `${result.businesses.length} ${result.businesses.length === 1 ? 'business is' : 'businesses are'} still on this plan. ` +
        'Moving them somewhere else first is the only way to delete it — deleting would leave them with no plan, ' +
        'which means unlimited replies. Retire the plan instead if you only want it off the pricing page.',
      businesses: result.businesses,
    },
    409,
  );
});

const listBusinessPlansRoute = createRoute({
  method: 'get',
  path: '/admin/plans/businesses',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(adminBusinessPlanSchema) } },
      description:
        'Every live business with its plan, cycle anchor and current-cycle usage. Businesses the operator revoked show with planId null.',
    },
  },
});

adminPlansRouter.openapi(listBusinessPlansRoute, async (c) => c.json(await listAdminBusinessPlans(), 200));

const assignBusinessPlanRoute = createRoute({
  method: 'put',
  path: '/admin/businesses/{businessId}/plan',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: {
    params: businessParams,
    body: { content: { 'application/json': { schema: assignPlanInputSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: quotaStatusSchema } },
      description: 'The cycle and counters as they stand after the change',
    },
    400: { content: { 'application/json': { schema: errorSchema } }, description: 'No such plan' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
  },
});

/**
 * The operator's override: unlike the merchant's own switch, this one may put a business
 * below what it has already spent, because the operator is also the one who can hand out
 * more. The notices that fall out of it are written here, in the same request.
 */
adminPlansRouter.openapi(assignBusinessPlanRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { planId } = c.req.valid('json');

  let target: Plan | null = null;
  if (planId) {
    target = await getPlanById(planId);
    if (!target) return c.json({ error: 'Plan not found' }, 400);
  }

  const assigned = await assignPlan(businessId, target?.id ?? null, { actorKind: 'operator' });
  if (!assigned) return c.json({ error: 'Business not found' }, 404);

  const status = await getQuotaStatus(businessId);
  if (!status) return c.json({ error: 'Business not found' }, 404);

  if (status.messageLimit !== null) {
    await ensureQuotaNotice(
      businessId, 'message', status.cycle.period, status.messagesUsed, status.messageLimit, status.cycle.resetsAt,
    );
  }
  if (status.commentLimit !== null) {
    await ensureQuotaNotice(
      businessId, 'comment', status.cycle.period, status.commentsUsed, status.commentLimit, status.cycle.resetsAt,
    );
  }

  return c.json(status, 200);
});

const resetCycleRoute = createRoute({
  method: 'post',
  path: '/admin/businesses/{businessId}/plan/reset',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { params: businessParams },
  responses: {
    200: {
      content: { 'application/json': { schema: quotaStatusSchema } },
      description: 'A fresh cycle: same plan, counters at zero, a new anchor date',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'No such business' },
  },
});

/**
 * Grant a fresh cycle. There is no payment rail, so this is the only way to give a
 * merchant more before their own boundary; it is why the audit row exists, and why it is
 * written as an operator action rather than as 'system' — extra budget with no money
 * behind it has to be traceable to a person.
 */
adminPlansRouter.openapi(resetCycleRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const reset = await resetCycle(businessId, { actorKind: 'operator' });
  if (!reset) return c.json({ error: 'Business not found' }, 404);

  const status = await getQuotaStatus(businessId);
  if (!status) return c.json({ error: 'Business not found' }, 404);
  return c.json(status, 200);
});

const listAssignmentsRoute = createRoute({
  method: 'get',
  path: '/admin/businesses/{businessId}/assignments',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { params: businessParams },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(planAssignmentSchema) } },
      description: 'Who put this business on what, newest first',
    },
  },
});

adminPlansRouter.openapi(listAssignmentsRoute, async (c) =>
  c.json(await listAssignments(c.req.param('businessId')), 200),
);
