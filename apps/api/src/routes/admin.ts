import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  adminStatsResponseSchema,
  agentOverrideReportSchema,
  agentGuidanceDefaultsSchema,
  errorSchema,
  followDefaultAgentInputSchema,
  platformAgentSchema,
  resolveTimeZone,
  updatePlatformAgentInputSchema,
  type AdminStatsResponse,
} from '@repo/shared';
import { COMMENT_REPLY_GUIDANCE, DEFAULT_REPLY_GUIDANCE } from '@repo/agent';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import { queryLogs, MAX_LIMIT } from '@api/lib/log-query';
import { emit, errorFields } from '@api/lib/log';
import { toRecordsCsv } from '@api/lib/csv';
import { getPlatformBusinessExportData } from '@repo/db/crud/business-export';
import {
  getOverrideReport,
  getPlatformAgent,
  makeAgentFollowDefault,
  updatePlatformAgent,
} from '@repo/db/crud/default-agent';
import {
  getAdminDailySeries,
  getAdminSnapshot,
  getAdminTopBusinesses,
  getAdminWindowMetrics,
  resolveAdminRange,
  type AdminRange,
} from '@repo/db/crud/admin-analytics';
import {
  getBusinessTokenUsageDetail,
  listBusinessTokenUsage,
} from '@repo/db/crud/admin-token-analytics';

/**
 * The operator dashboard's data. Same gate as the log console — the console password
 * or an allowlisted account — because it is the same audience and reads the same
 * numbers, just grouped. Nothing here is scoped to one business, which is exactly why
 * it is not on `/api/v1`.
 */
export const adminRouter = new OpenAPIHono({
  defaultHook: (result, c) =>
    result.success
      ? undefined
      : c.json({ error: 'Invalid request — days must be a positive integer and a business id a uuid' }, 400),
});

adminRouter.use('*', logsAuthMiddleware);

const exportCsvRoute = createRoute({
  method: 'get',
  path: '/admin/export.csv',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'text/csv': { schema: z.string() } },
      description: 'Platform business records and retained event logs as CSV',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No valid operator session',
    },
    502: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'The event log store could not be queried',
    },
  },
});

adminRouter.openapi(exportCsvRoute, async (c) => {
  const endTime = new Date();
  // Event logs have a 31-day query limit and the configured store retains about a month.
  const startTime = new Date(endTime.getTime() - LOG_RETENTION_MS).toISOString();
  const businessGroups = await getPlatformBusinessExportData();
  const logRows: Array<{ time: string; evt: string; [key: string]: unknown }> = [];
  let pageEndTime = endTime.toISOString();

  try {
    while (true) {
      const page = await queryLogs({ startTime, endTime: pageEndTime, limit: MAX_LIMIT });
      logRows.push(
        ...page.events.map((event) => ({ time: event.time, evt: event.evt, ...event.fields })),
      );
      const oldest = page.events.at(-1)?.time;
      if (!page.nextCursor || !oldest || Date.parse(oldest) <= Date.parse(startTime)) break;
      if (oldest === pageEndTime) break;
      pageEndTime = oldest;
    }
  } catch (err) {
    emit('error', errorFields(err));
    return c.json({ error: 'Event log store query failed' }, 502);
  }

  const csv = toRecordsCsv([
    ...businessGroups,
    { type: 'event_log', rows: logRows },
  ]);
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="oryxa-admin-export.csv"',
    'Cache-Control': 'private, no-store',
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
/** A year of daily bars is 365 points; beyond that the page is a spreadsheet, not a dashboard. */
const MAX_DAYS = 365;
/** Errors and auth rejections are counted out of at most this many rows — a log query is billed by what it returns. */
const ANOMALY_CAP = 50;
/** The log store keeps about a month, so a wider range asks only the last retained day of it. */
const LOG_RETENTION_MS = 30 * DAY_MS;

/**
 * `evt=auth` rows that mean someone was let in. The health card counts rejections, so
 * these are left out of the query: an operator opening this very dashboard writes an
 * auth row for the request that serves it, and a count of every auth row would report
 * the console's own page loads as failures. 82 of the last 100 auth rows in production
 * were exactly that.
 */
const AUTH_SUCCESS_REASONS = ['logs_operator', 'dev_bypass'];

const getAdminStatsRoute = createRoute({
  method: 'get',
  path: '/admin/stats',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      // Parsed by hand: a browser form sends `days=` when nothing is chosen, and an
      // out-of-range number is clamped rather than refused.
      days: z.string().optional(),
      tz: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: adminStatsResponseSchema } },
      description: 'Platform totals, a per-day series, the busiest stores and the log store health',
    },
    400: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'days is not a positive integer',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not allowed to read the platform numbers',
    },
    500: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'The database failed an aggregate',
    },
  },
});

adminRouter.openapi(getAdminStatsRoute, async (c) => {
  const query = c.req.valid('query');

  let days = DEFAULT_DAYS;
  if (query.days) {
    const parsed = Number.parseInt(query.days, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return c.json({ error: 'Invalid days — expected a positive integer' }, 400);
    }
    days = Math.min(parsed, MAX_DAYS);
  }

  const tz = resolveTimeZone(query.tz);
  // Both windows are computed from the reader's calendar, so the bars, the totals and
  // the delta all describe the same days.
  const { range, previous: previousRange } = resolveAdminRange(days, tz);

  const anomalies = await countAnomalies(range);
  const [snapshot, window, previous, daily, topBusinesses] = await Promise.all([
    getAdminSnapshot(),
    getAdminWindowMetrics(range),
    getAdminWindowMetrics(previousRange),
    getAdminDailySeries(range),
    getAdminTopBusinesses(range),
  ]);

  const body: AdminStatsResponse = {
    range: {
      days,
      tz,
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
    },
    snapshot,
    window,
    previous,
    daily,
    topBusinesses,
    anomalies,
  };
  return c.json(body, 200);
});

/**
 * Two small log queries, run outside the Postgres fan-out so a store that is down
 * costs the health card and nothing else. `previous` windows are not counted here:
 * a comparison against a month the log store may have already dropped would read as
 * a dramatic improvement rather than as retention.
 */
async function countAnomalies(range: AdminRange): Promise<AdminStatsResponse['anomalies']> {
  const from = new Date(Math.max(range.start.getTime(), range.end.getTime() - LOG_RETENTION_MS));
  if (from >= range.end) return null;

  const filter = { startTime: from.toISOString(), endTime: range.end.toISOString(), limit: ANOMALY_CAP };
  try {
    const [errors, auth] = await Promise.all([
      queryLogs({ ...filter, evt: 'error' }),
      queryLogs({ ...filter, evt: 'auth', notReasons: AUTH_SUCCESS_REASONS }),
    ]);
    return { errors: errors.events.length, authRejections: auth.events.length, cap: ANOMALY_CAP };
  } catch (err) {
    emit('error', errorFields(err));
    return null;
  }
}

/**
 * Token usage, per store, for one calendar month. This used to be a merchant screen;
 * the numbers are the platform's cost, so they live on the operator side now. The
 * rollup they read is written by the agent either way, so nothing is gathered here that
 * the store's own traffic did not already record.
 */
const usageRowSchema = z.object({
  businessId: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheHitTokens: z.number(),
  cacheMissTokens: z.number(),
  runCount: z.number(),
  avgTokensPerRun: z.number(),
  cacheHitPercent: z.number(),
  estimatedCostUsd: z.number(),
});

const listTokenUsageResponseSchema = z.object({
  month: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  platform: z.object({
    businesses: z.number(),
    totalTokens: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheHitTokens: z.number(),
    runCount: z.number(),
    avgTokensPerRun: z.number(),
    cacheHitPercent: z.number(),
    estimatedCostUsd: z.number(),
  }),
  businesses: z.array(usageRowSchema),
});

const tokenUsageDetailResponseSchema = z.object({
  month: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  business: z.object({ id: z.string(), name: z.string(), slug: z.string().nullable() }),
  totals: z.object({
    totalTokens: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheHitTokens: z.number(),
    cacheMissTokens: z.number(),
    runCount: z.number(),
    avgTokensPerRun: z.number(),
    avgLatencyMs: z.number(),
    cacheHitPercent: z.number(),
    estimatedCostUsd: z.number(),
  }),
  byIntegration: z.array(
    z.object({
      integrationType: z.string(),
      totalTokens: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      runCount: z.number(),
      avgTokensPerRun: z.number(),
      cacheHitPercent: z.number(),
      estimatedCostUsd: z.number(),
    }),
  ),
  daily: z.array(
    z.object({
      date: z.string(),
      totalTokens: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheHitTokens: z.number(),
      runCount: z.number(),
      estimatedCostUsd: z.number(),
    }),
  ),
});

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A calendar month in UTC, as `[start, end)`. The month arrives as `YYYY-MM` from the
 * console's own selector; anything malformed is read as this month rather than refused,
 * because a stale bookmark should show numbers, not an error page.
 */
function resolveMonthWindow(month: string | undefined, now = new Date()) {
  const key = month && MONTH_KEY.test(month) ? month : now.toISOString().slice(0, 7);
  const [year, numbered] = key.split('-').map(Number);
  return {
    month: key,
    start: new Date(Date.UTC(year, numbered - 1, 1)),
    end: new Date(Date.UTC(year, numbered, 1)),
  };
}

const monthQuery = z.object({
  // `optional()` and hand-parsed like `days`: an empty `<select>` sends `month=`.
  month: z.string().optional(),
});

const listTokenUsageRoute = createRoute({
  method: 'get',
  path: '/admin/token-analytics/businesses',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { query: monthQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: listTokenUsageResponseSchema } },
      description: 'Every store that used the agent this month, heaviest first',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not allowed to read the platform numbers',
    },
  },
});

adminRouter.openapi(listTokenUsageRoute, async (c) => {
  const { start, end, month } = resolveMonthWindow(c.req.valid('query').month);
  const businesses = await listBusinessTokenUsage(start, end);

  const sum = (pick: (row: (typeof businesses)[number]) => number) =>
    businesses.reduce((total, row) => total + pick(row), 0);
  const inputTokens = sum((row) => row.inputTokens);
  const totalTokens = sum((row) => row.totalTokens);
  const runCount = sum((row) => row.runCount);

  return c.json(
    {
      month,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      platform: {
        businesses: businesses.length,
        totalTokens,
        inputTokens,
        outputTokens: sum((row) => row.outputTokens),
        cacheHitTokens: sum((row) => row.cacheHitTokens),
        runCount,
        // Re-derived from the sums rather than averaged over each store's own average,
        // which would weight a store with two runs the same as one with twenty thousand.
        avgTokensPerRun: runCount ? Math.round((totalTokens / runCount) * 100) / 100 : 0,
        cacheHitPercent: inputTokens
          ? Math.round((sum((row) => row.cacheHitTokens) / inputTokens) * 10000) / 100
          : 0,
        estimatedCostUsd: sum((row) => row.estimatedCostUsd),
      },
      businesses,
    },
    200,
  );
});

const tokenUsageDetailRoute = createRoute({
  method: 'get',
  path: '/admin/token-analytics/businesses/{businessId}',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ businessId: z.string().uuid() }), query: monthQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: tokenUsageDetailResponseSchema } },
      description: "One store's month of usage: totals, per pipeline, per day",
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No live store with that id',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not allowed to read the platform numbers',
    },
  },
});

adminRouter.openapi(tokenUsageDetailRoute, async (c) => {
  const businessId = c.req.valid('param').businessId;
  const { start, end, month } = resolveMonthWindow(c.req.valid('query').month);
  const detail = await getBusinessTokenUsageDetail(businessId, start, end);
  if (!detail) return c.json({ error: 'Business not found' }, 404);

  return c.json({ month, startTime: start.toISOString(), endTime: end.toISOString(), ...detail }, 200);
});

/**
 * The agent every store answers with until it writes one of its own.
 *
 * This is the prompt edit that reaches the merchants who are replying to customers today: a store's row
 * copied the built-in text when the store was created and has heard nothing from it since, which is how
 * an operator's wording change silently landed on nobody. A store that wrote its own prompt is an override
 * and stays one — this route does not reach it.
 *
 * Reads and writes take the same gate as every other `/api2` route: the console bearer, never a merchant's
 * Firebase token, because one write here speaks for every business on the platform.
 */
const getPlatformAgentRoute = createRoute({
  method: 'get',
  path: '/admin/default-agent',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        'application/json': { schema: platformAgentSchema.extend({ guidanceDefaults: agentGuidanceDefaultsSchema }) },
      },
      // The row's own text, plus the reviewed blocks an empty wording box falls back to. The console shows
      // the latter as the box's placeholder: writing there REPLACES that whole block for every following
      // store — including the pure-Bangla rule — so an editor that could not show what it was replacing
      // would be inviting the operator to delete it blind.
      description: 'The default agent, created from the reviewed text if this is the first read of it',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not the operator',
    },
  },
});

adminRouter.openapi(getPlatformAgentRoute, async (c) => {
  const platform = await getPlatformAgent();
  return c.json(
    {
      ...platform,
      guidanceDefaults: {
        replyGuidance: platform.replyGuidance ?? DEFAULT_REPLY_GUIDANCE,
        commentReplyGuidance: platform.commentReplyGuidance ?? COMMENT_REPLY_GUIDANCE,
      },
    },
    200,
  );
});

const updatePlatformAgentRoute = createRoute({
  method: 'put',
  path: '/admin/default-agent',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: updatePlatformAgentInputSchema } } } },
  responses: {
    200: {
      content: { 'application/json': { schema: platformAgentSchema } },
      description: 'The saved default. Stores following it answer with this on the customer’s next message.',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not the operator',
    },
  },
});

adminRouter.openapi(updatePlatformAgentRoute, async (c) => {
  // No log event here: the event vocabulary is closed on purpose (Axiom caps a dataset at 256 permanent
  // fields) and no other console write emits one. The row's own updated_at is the audit trail.
  return c.json(await updatePlatformAgent(c.req.valid('json')), 200);
});

/**
 * Which stores are NOT answering with the default, and the one click that brings a store back.
 *
 * The fleet's state was only readable with SQL, while the way out of it — a save in the playground —
 * takes one keystroke. That asymmetry is what this pair of routes closes.
 */
const getOverridesRoute = createRoute({
  method: 'get',
  path: '/admin/default-agent/overrides',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: agentOverrideReportSchema } },
      description: 'Every live agent, split into those following the default and those answering their own',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not the operator',
    },
  },
});

adminRouter.openapi(getOverridesRoute, async (c) => c.json(await getOverrideReport(), 200));

const followDefaultAgentRoute = createRoute({
  method: 'post',
  path: '/admin/default-agent/overrides/follow',
  tags: ['Admin'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: followDefaultAgentInputSchema } } } },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ id: z.string().uuid(), followsDefault: z.literal(true) }) } },
      description: 'The store now answers with the default; its own text stays in its row, unused',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not the operator',
    },
    404: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No live agent with that id',
    },
  },
});

adminRouter.openapi(followDefaultAgentRoute, async (c) => {
  const { agentId } = c.req.valid('json');
  const updated = await makeAgentFollowDefault(agentId);
  if (!updated) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ id: updated.id, followsDefault: true as const }, 200);
});
