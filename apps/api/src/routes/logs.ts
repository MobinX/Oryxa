import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  errorSchema,
  logQueryResponseSchema,
  logTypesResponseSchema,
  LOG_EVENT_LABELS,
  LOG_EVENT_TYPES,
  type LogQueryResponse,
} from '@repo/shared';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import {
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
  MAX_LIMIT,
  MAX_WINDOW_MS,
  decodeCursor,
  encodeCursor,
  logQuerySource,
  queryLogs,
  type LogFilter,
} from '@api/lib/log-query';
import { emit, errorFields } from '@api/lib/log';

// A validation hook of its own so a bad `type` answers in the shape this route
// documents, instead of zod-openapi's default issue dump. Scoped to this router,
// so nothing on /api/v1 can be affected by it.
export const logsRouter = new OpenAPIHono({
  defaultHook: (result, c) =>
    result.success
      ? undefined
      : c.json({ error: 'Invalid query — check type, start, end, limit and cursor' }, 400),
});

logsRouter.use('*', logsAuthMiddleware);

const listLogsRoute = createRoute({
  method: 'get',
  path: '/logs',
  tags: ['Logs'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      // A browser form submits an unselected `<select>` as `type=`, so empty means
      // "no filter" rather than a validation error.
      type: z.union([z.enum(LOG_EVENT_TYPES), z.literal('')]).optional(),
      // Parsed by hand so a `datetime-local` value with no timezone is accepted.
      start: z.string().optional(),
      end: z.string().optional(),
      limit: z.string().optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: logQueryResponseSchema } },
      description: 'Log events, newest first, inside the resolved window',
    },
    400: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Invalid start, end, limit or cursor',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not allowed to read logs',
    },
    502: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'The log store rejected or failed the query',
    },
  },
});

logsRouter.openapi(listLogsRoute, async (c) => {
  const query = c.req.valid('query');

  let startTime: string | undefined;
  if (query.start) {
    startTime = parseInstant(query.start);
    if (!startTime) return c.json({ error: 'Invalid start — expected an ISO instant' }, 400);
  }

  let endTime: string | undefined;
  if (query.end) {
    endTime = parseInstant(query.end);
    if (!endTime) return c.json({ error: 'Invalid end — expected an ISO instant' }, 400);
  }

  let before: string | undefined;
  if (query.cursor) {
    before = decodeCursor(query.cursor);
    if (!before) return c.json({ error: 'Invalid cursor' }, 400);
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit) {
    const parsed = Number.parseInt(query.limit, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return c.json({ error: 'Invalid limit — expected a positive integer' }, 400);
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  // Paging narrows the upper bound rather than moving a window, so a page can
  // never re-show what the previous one already did.
  const resolvedEnd = earliest(endTime ?? new Date().toISOString(), before);
  const resolvedStart = startTime ?? new Date(Date.parse(resolvedEnd) - DEFAULT_WINDOW_MS).toISOString();

  if (Date.parse(resolvedStart) >= Date.parse(resolvedEnd)) {
    return c.json(
      { events: [], window: { startTime: resolvedStart, endTime: resolvedEnd }, limit, source: logQuerySource() },
      200,
    );
  }

  if (Date.parse(resolvedEnd) - Date.parse(resolvedStart) > MAX_WINDOW_MS) {
    return c.json({ error: `Window too large — ${Math.round(MAX_WINDOW_MS / 86_400_000)} days maximum` }, 400);
  }

  const filter: LogFilter = {
    ...(query.type ? { evt: query.type } : {}),
    startTime: resolvedStart,
    endTime: resolvedEnd,
    limit,
  };

  try {
    const result = await queryLogs(filter);
    return c.json(stepBackWindow(result, query.start, resolvedStart), 200);
  } catch (err) {
    // A store failure is this route's outcome, so it is reported here rather than
    // waiting for a thrown error to reach onError.
    emit('error', errorFields(err));
    return c.json({ error: 'Log store query failed' }, 502);
  }
});

const listLogTypesRoute = createRoute({
  method: 'get',
  path: '/logs/types',
  tags: ['Logs'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: logTypesResponseSchema } },
      description: 'The event types the logger is allowed to emit',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'No usable session — a Firebase token or the log console password',
    },
    403: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Caller is authenticated but not allowed to read logs',
    },
  },
});

logsRouter.openapi(listLogTypesRoute, (c) =>
  c.json(
    {
      types: LOG_EVENT_TYPES.map((evt) => ({ evt, label: LOG_EVENT_LABELS[evt] })),
    },
    200,
  ),
);

/**
 * `datetime-local` inputs send no zone. Reading that as UTC puts the filter in the
 * same frame as the event times, which the logger always writes in UTC.
 */
function parseInstant(raw: string): string | undefined {
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(raw);
  const parsed = new Date(naive ? `${raw}Z` : raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function earliest(a: string, b: string | undefined): string {
  return b !== undefined && Date.parse(b) < Date.parse(a) ? b : a;
}

/**
 * A reader who named no `start` is browsing backwards, not bounded, so running out
 * of window is a step to the previous one rather than a dead end: the cursor below
 * becomes the next call's exclusive upper bound, and its own default span puts it
 * one window further back. Stops at the retention edge, past which there is
 * nothing to page to.
 */
function stepBackWindow(
  result: LogQueryResponse,
  explicitStart: string | undefined,
  resolvedStart: string,
): LogQueryResponse {
  if (explicitStart || result.nextCursor) return result;
  if (Date.parse(resolvedStart) <= Date.now() - MAX_WINDOW_MS) return result;
  return { ...result, nextCursor: encodeCursor(resolvedStart) };
}
