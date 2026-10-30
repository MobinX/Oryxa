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
  'instagram',
  'official',
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
  instagram: 'Instagram webhook',
  official: 'Official Channels turn',
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

export const axiomStorageDatasetSchema = z
  .object({
    name: z.string(),
    bytes: z.number(),
    measuredAt: z.string(),
  })
  .openapi('AxiomStorageDataset');

export const axiomLogRetentionSchema = z
  .object({
    name: z.string(),
    bytes: z.number().nullable(),
    retentionDays: z.number().int(),
    retentionEnabled: z.boolean(),
    /** False when the dataset metadata could not be read. */
    retentionKnown: z.boolean(),
    /** Oldest event still stored, or null when it could not be read. */
    oldestEventAt: z.string().nullable(),
    /**
     * When that oldest event is due to be deleted. Null when retention is off,
     * where Axiom keeps the dataset until it is deleted by hand.
     */
    expiresAt: z.string().nullable(),
  })
  .openapi('AxiomLogRetention');

export const axiomStorageResponseSchema = z
  .object({
    source: logQuerySourceSchema,
    available: z.boolean(),
    note: z.string().optional(),
    usedBytes: z.number().nullable(),
    usedGb: z.number().nullable(),
    limitGb: z.number(),
    /** False when the 100 GB Axiom always-free allowance is the default. */
    limitConfigured: z.boolean(),
    remainingGb: z.number().nullable(),
    percentUsed: z.number().nullable(),
    /** When Axiom last calculated storage usage; it does so once a day. */
    measuredAt: z.string().nullable(),
    datasets: z.array(axiomStorageDatasetSchema),
    logDataset: axiomLogRetentionSchema,
  })
  .openapi('AxiomStorageResponse');

export type LogEventType = (typeof LOG_EVENT_TYPES)[number];
export type LogTypeOption = z.infer<typeof logTypeOptionSchema>;
export type LogTypesResponse = z.infer<typeof logTypesResponseSchema>;
export type LogQuerySource = z.infer<typeof logQuerySourceSchema>;
export type LogEventRow = z.infer<typeof logEventRowSchema>;
export type LogQueryResponse = z.infer<typeof logQueryResponseSchema>;
export type AxiomStorageDataset = z.infer<typeof axiomStorageDatasetSchema>;
export type AxiomLogRetention = z.infer<typeof axiomLogRetentionSchema>;
export type AxiomStorageResponse = z.infer<typeof axiomStorageResponseSchema>;
