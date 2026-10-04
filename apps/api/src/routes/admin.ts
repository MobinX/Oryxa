import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  adminStatsResponseSchema,
  errorSchema,
  resolveTimeZone,
  type AdminStatsResponse,
} from '@repo/shared';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import { queryLogs } from '@api/lib/log-query';
import { emit, errorFields } from '@api/lib/log';
import {
  getAdminDailySeries,
  getAdminSnapshot,
  getAdminTopBusinesses,
  getAdminWindowMetrics,
  resolveAdminRange,
  type AdminRange,
} from '@repo/db/crud/admin-analytics';

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
      : c.json({ error: 'Invalid query — days must be a positive integer' }, 400),
});

adminRouter.use('*', logsAuthMiddleware);

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
