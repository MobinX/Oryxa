import { z } from '@hono/zod-openapi';

/**
 * The closed event vocabulary. It lives here rather than in the logger so the
 * query route, the logger and the web UI all read one list: Axiom caps a dataset
 * at 256 permanent fields, so an event type nobody declared must never appear.
 */
export const LOG_EVENT_TYPES = [
  'req',
  'error',
  'not_found',
  'auth',
  'webhook',
  'webhook_item',
  'http_out',
  'db',
  'db_summary',
  'agent_run',
  'agent_input',
  'tool_call',
  'tool_result',
  'bg',
  'anomaly',
  'log_dropped',
] as const;

export const LOG_EVENT_LABELS: Record<(typeof LOG_EVENT_TYPES)[number], string> = {
  req: 'API request',
  error: 'Unhandled error',
  not_found: 'Unmatched route',
  auth: 'Auth decision',
  webhook: 'Webhook delivery',
  webhook_item: 'Webhook item',
  http_out: 'Outbound call',
  db: 'Database query',
  db_summary: 'Database rollup',
  agent_run: 'Agent run outcome',
  agent_input: 'History handed to the agent',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  bg: 'Background task',
  anomaly: 'Broken invariant',
  log_dropped: 'Dropped logs',
};

export const logEventTypeSchema = z.enum(LOG_EVENT_TYPES).openapi('LogEventType');

export const logTypeOptionSchema = z
  .object({
    evt: logEventTypeSchema,
    label: z.string(),
  })
  .openapi('LogTypeOption');

export const logTypesResponseSchema = z
  .object({
    types: z.array(logTypeOptionSchema),
  })
  .openapi('LogTypesResponse');

export const logQuerySourceSchema = z.enum(['axiom', 'memory']).openapi('LogQuerySource');

export const logEventRowSchema = z
  .object({
    /** Event time as the logger stamped it, not ingest time. */
    time: z.string(),
    evt: z.string(),
    /** Every remaining allowlisted field, including the correlation ids. */
    fields: z.record(z.string(), z.unknown()),
  })
  .openapi('LogEventRow');

export const logQueryWindowSchema = z
  .object({
    startTime: z.string(),
    endTime: z.string(),
  })
  .openapi('LogQueryWindow');

export const logQueryResponseSchema = z
  .object({
    events: z.array(logEventRowSchema),
    /** Opaque: pass back as `cursor` for the next older page. Absent at the end. */
    nextCursor: z.string().optional(),
    window: logQueryWindowSchema,
    limit: z.number().int(),
    source: logQuerySourceSchema,
  })
  .openapi('LogQueryResponse');

export type LogEventType = (typeof LOG_EVENT_TYPES)[number];
export type LogTypeOption = z.infer<typeof logTypeOptionSchema>;
export type LogTypesResponse = z.infer<typeof logTypesResponseSchema>;
export type LogQuerySource = z.infer<typeof logQuerySourceSchema>;
export type LogEventRow = z.infer<typeof logEventRowSchema>;
export type LogQueryResponse = z.infer<typeof logQueryResponseSchema>;
