import { AxiomWithoutBatching } from '@axiomhq/js';
import { currentContext, markSeen, type LogContext } from './ctx';

export const EVENTS = [
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

export type Evt = (typeof EVENTS)[number];

type Fields = Record<string, unknown>;

/**
 * Axiom caps a dataset at 256 fields (1024 on paid plans) and each new field
 * name is permanent, so the vocabulary is closed: a field that is not listed
 * here for its event type is dropped instead of ingested.
 */
const ALLOWLIST: Record<Evt, readonly string[]> = {
  req: ['method', 'path', 'routePath', 'status', 'durationMs', 'contentLength', 'userAgent'],
  error: ['name', 'message', 'stack'],
  not_found: ['method', 'path'],
  // reason/uid only: path, method and status already live on the one evt=req
  // for this request, and repeating them here would be the same fact twice.
  auth: ['reason', 'uid'],
  webhook: ['pageId', 'entryCount', 'messagingCount', 'changesCount', 'signatureValid', 'channelId', 'event'],
  webhook_item: ['externalId', 'commentId', 'parentId', 'verb', 'kind', 'inserted', 'priorStatus', 'channelId'],
  http_out: ['host', 'targetPath', 'httpMethod', 'status', 'durationMs', 'ok', 'errorName', 'service'],
  db: ['table', 'operation', 'durationMs', 'rowCount', 'slow', 'errorName'],
  db_summary: ['table', 'count', 'totalMs'],
  agent_run: [
    'ok',
    'pendingClaimed',
    'sentViaTool',
    'sentViaFallback',
    'repliedCount',
    'fallbackUsed',
    'stateSetTo',
    'toolCallCount',
    'replyText',
    'reTriggered',
    'externalId',
    'provider',
    'model',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheHitTokens',
    'cacheMissTokens',
    'cacheHitPercent',
    'estimatedCostUsd',
    'durationMs',
  ],
  agent_input: ['historyLength', 'turns', 'catalogCount', 'systemPromptLength'],
  tool_call: ['tool', 'toolCallId', 'args'],
  tool_result: ['tool', 'toolCallId', 'ok', 'result', 'durationMs'],
  bg: ['task', 'ok', 'durationMs', 'name', 'message', 'stack'],
  anomaly: ['kind', 'detail', 'count'],
  log_dropped: ['droppedEvents'],
};

/** Precomputed so `emit()` allocates nothing per event on the request path. */
const ALLOWED: Record<Evt, ReadonlySet<string>> = Object.fromEntries(
  EVENTS.map((evt) => [evt, new Set(ALLOWLIST[evt])]),
) as Record<Evt, ReadonlySet<string>>;

/** Text that leaves the system because the owner asked to see it, gated by LOG_CONTENT. */
const CUSTOMER_TEXT = new Set(['content', 'text', 'replyText', 'turns', 'args', 'result']);
/** Read as blobs rather than queried, so they get a wider cap than a chat line. */
const WIDE_TEXT = new Set(['args', 'result', 'stack']);
/**
 * The history handed to the model. It is the one field the owner asked for in
 * full, and a truncation here would cut the newest turns — the ones that explain
 * the reply — so it gets its own, much larger cap.
 */
const TRANSCRIPT = new Set(['turns']);

const SECRET_RE = /EAA|sk-|Bearer |access_token=|ya29\./g;
const BLOCKED_KEYS = new Set([
  'pagetoken',
  'apitoken',
  'accesstoken',
  'refreshtoken',
  'token',
  'authorization',
  'signature',
  'secret',
  'password',
  'privatekey',
  'client_email',
]);

const FLUSH_EVENTS = 500;
const FLUSH_BYTES = 256 * 1024;
const MAX_EVENTS = 2000;
const MAX_BYTES = 1024 * 1024;

type Sink = 'axiom' | 'stdout' | 'none';
interface Queued {
  event: Fields;
  size: number;
}

interface ContentPolicy {
  mode: 'full' | 'reply-only' | 'none';
  base: number;
  wide: number;
  transcript: number;
}

let queue: Queued[] = [];
let queueBytes = 0;
let droppedEvents = 0;
let flushChain: Promise<void> = Promise.resolve();
let axiomClient: AxiomWithoutBatching | undefined;
let forcedSink: Sink | undefined;
let injectedIngest: ((events: Fields[]) => Promise<void>) | undefined;
const warnedFields = new Set<string>();

function envFlag(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(envFlag(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sink(): Sink {
  if (forcedSink) return forcedSink;
  if (envFlag('AXIOM_ENABLED') === '1') {
    return envFlag('AXIOM_TOKEN') ? 'axiom' : 'stdout';
  }
  const configured = envFlag('LOG_SINK');
  if (configured === 'axiom' || configured === 'stdout' || configured === 'none') return configured;
  // Unit tests would otherwise drown in JSON lines.
  return process.env.NODE_ENV === 'test' ? 'none' : 'stdout';
}

function dataset(): string {
  return envFlag('AXIOM_DATASET') ?? 'oryxa-events';
}

/** True when events are leaving via ingest, so callers must not also print them. */
export function logsToAxiom(): boolean {
  return sink() === 'axiom';
}

/** Read once per event, not once per field — emit() sits on the hot path. */
function contentPolicy(): ContentPolicy {
  const raw = envFlag('LOG_CONTENT');
  const mode: ContentPolicy['mode'] = raw === 'none' || raw === 'reply-only' ? raw : 'full';
  const base = envInt('LOG_TRUNCATE', 500);
  const wide = Math.max(base, 4000);
  return { mode, base, wide, transcript: Math.max(wide, envInt('LOG_TRUNCATE_HISTORY', 12_000)) };
}

function capFor(field: string, policy: ContentPolicy): number {
  if (TRANSCRIPT.has(field)) return policy.transcript;
  return WIDE_TEXT.has(field) ? policy.wide : policy.base;
}

function redact(value: string): string {
  return value.replace(SECRET_RE, '[redacted]');
}

function scalarize(field: string, value: unknown, policy: ContentPolicy): string | number | boolean | null | undefined {
  const limit = capFor(field, policy);
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return redact(value.length > limit ? `${value.slice(0, limit)}…` : value);
  }
  if (value instanceof Error) {
    return redact(`${value.name}: ${value.message}`).slice(0, limit);
  }
  try {
    return redact(JSON.stringify(value)).slice(0, limit);
  } catch {
    return '[unserializable]';
  }
}

function filterFields(evt: Evt, fields: Fields, policy: ContentPolicy): Fields {
  const allowed = ALLOWED[evt];
  const out: Fields = {};
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) {
      const marker = `${evt}.${key}`;
      if (!warnedFields.has(marker) && process.env.NODE_ENV !== 'production') {
        warnedFields.add(marker);
        console.warn(`[log] field "${key}" is not allowlisted for evt=${evt}; dropped from the ingest schema`);
      }
      continue;
    }
    const isCustomerText = CUSTOMER_TEXT.has(key);
    if (BLOCKED_KEYS.has(key.toLowerCase())) continue;
    if (isCustomerText && policy.mode !== 'full' && !(policy.mode === 'reply-only' && key === 'replyText')) continue;
    const value = scalarize(key, fields[key], policy);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function dedupeKey(
  evt: Evt,
  fields: Fields,
  ctx: LogContext | undefined,
  override?: string | null,
): string | null {
  if (override !== undefined) return override === null ? null : `${evt}:${override}`;
  const requestId = ctx?.requestId;
  switch (evt) {
    case 'req':
    case 'not_found':
    case 'error':
    case 'bg':
    case 'log_dropped':
      return requestId ? `${evt}:${requestId}` : null;
    case 'auth':
      return `${evt}:${requestId ?? ''}:${fields.reason ?? ''}`;
    case 'anomaly':
      return `${evt}:${fields.kind ?? ''}`;
    case 'agent_run':
      return ctx ? `${evt}:${ctx.runId}` : null;
    case 'tool_call':
    case 'tool_result':
      return fields.toolCallId ? `${evt}:${String(fields.toolCallId)}` : null;
    default:
      return null;
  }
}

function stamp(ctx: LogContext | undefined): Fields {
  const event: Fields = { time: new Date().toISOString(), env: process.env.NODE_ENV ?? 'unknown' };
  const release = envFlag('VERCEL_GIT_COMMIT_SHA') ?? envFlag('COMMIT_SHA');
  if (release) event.release = release.slice(0, 12);
  if (ctx) {
    event.requestId = ctx.requestId;
    event.runId = ctx.runId;
    if (ctx.runDepth > 0) event.runDepth = ctx.runDepth;
    if (ctx.userId) event.userId = ctx.userId;
    if (ctx.businessId) event.businessId = ctx.businessId;
    if (ctx.channelId) event.channelId = ctx.channelId;
    if (ctx.conversationId) event.conversationId = ctx.conversationId;
    if (ctx.commentThreadId) event.commentThreadId = ctx.commentThreadId;
  }
  return event;
}

/**
 * Queues an event for the next flush. Does no I/O and allocates no timer: all
 * network happens in flush(), so a request is never slowed by a log line, and a
 * repeated fact is dropped rather than sent twice.
 */
export function emit(evt: Evt, fields: Fields = {}, opts: { dedupe?: string | null } = {}): void {
  try {
    const target = sink();
    if (target === 'none') return;

    const ctx = currentContext();
    const key = dedupeKey(evt, fields, ctx, opts.dedupe);
    if (key && !markSeen(key)) return;

    const event = { ...stamp(ctx), evt, ...filterFields(evt, fields, contentPolicy()) };

    if (target === 'stdout') {
      console.log(JSON.stringify(event));
      return;
    }

    let size: number;
    try {
      size = JSON.stringify(event).length;
    } catch {
      droppedEvents++;
      return;
    }
    queue.push({ event, size });
    queueBytes += size;
    const maxEvents = envInt('LOG_MAX_EVENTS', MAX_EVENTS);
    while (queue.length > maxEvents || (queueBytes > MAX_BYTES && queue.length > 0)) {
      const dropped = queue.shift();
      if (!dropped) break;
      queueBytes -= dropped.size;
      droppedEvents++;
    }
    if (queue.length >= FLUSH_EVENTS || queueBytes >= FLUSH_BYTES) void flush();
  } catch {
    // A logging fault must never reach the caller or change a response.
  }
}

function client(): AxiomWithoutBatching {
  if (!axiomClient) {
    axiomClient = new AxiomWithoutBatching({ token: envFlag('AXIOM_TOKEN') ?? '', onError: () => {} });
  }
  return axiomClient;
}

async function sendOnce(): Promise<void> {
  const queued = queue;
  queue = [];
  queueBytes = 0;
  if (queued.length === 0) return;

  const dropped = droppedEvents;
  droppedEvents = 0;
  const events = queued.map((q) => q.event);
  if (dropped > 0) {
    events.push({ ...stamp(undefined), evt: 'log_dropped', droppedEvents: dropped });
  }

  try {
    if (injectedIngest) {
      await injectedIngest(events);
      return;
    }
    await client().ingest(dataset(), events, { timestampField: 'time' });
  } catch {
    // The SDK swallows transport failures itself; anything left here is a lost
    // batch, never an error that may surface into request handling.
  }
}

/**
 * Sends the whole queue in ONE ingest request, however many events it holds.
 * Flushes are serialized so overlapping invocations cannot interleave partial
 * batches, and the returned promise can never reject.
 */
export function flush(): Promise<void> {
  flushChain = flushChain.then(sendOnce, sendOnce).catch(() => {});
  return flushChain;
}

/** Meta puts access_token in query strings and webhook verification carries secrets. */
export function sanitizeUrl(url: string): { host: string; targetPath: string } | undefined {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, targetPath: parsed.pathname };
  } catch {
    return undefined;
  }
}

/** The three `evt=error` fields, from whatever was thrown. */
export function errorFields(err: unknown): Fields {
  const error = err instanceof Error ? err : new Error(String(err));
  return { name: error.name, message: error.message, stack: error.stack };
}

/**
 * Invariants that can be violated without any code throwing — the outcomes a
 * 200 response and a clean stack trace both hide. Queried by `kind`, so the
 * list is closed and a typo would silently create a monitor that never fires.
 */
export const ANOMALY_KINDS = [
  'channel_without_agent',
  'claim_lost',
  'backlog_claimed_but_unanswered',
  'comment_unanswered',
  'double_send',
  'run_loop_depth',
  'token_metrics_unrecorded',
  'error_state_done',
  'tool_call_unresolved',
  'duplicate_reply_prevented',
] as const;

export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

/** One event per violated invariant per invocation; `emit` drops the repeats. */
export function emitAnomaly(
  kind: AnomalyKind,
  extra: { detail?: unknown; count?: number } = {},
): void {
  emit('anomaly', { kind, ...extra });
}

/** @internal Test seam only — application code must never call this. */
export const __testOnly = {
  setSink(next: Sink | undefined) {
    forcedSink = next;
  },
  setIngest(fn: ((events: Fields[]) => Promise<void>) | undefined) {
    injectedIngest = fn;
  },
  queueSize: () => queue.length,
  queueBytes: () => queueBytes,
  droppedCount: () => droppedEvents,
  reset() {
    queue = [];
    queueBytes = 0;
    droppedEvents = 0;
    flushChain = Promise.resolve();
    axiomClient = undefined;
    forcedSink = undefined;
    injectedIngest = undefined;
    warnedFields.clear();
  },
};
