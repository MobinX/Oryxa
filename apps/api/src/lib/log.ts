import { AxiomWithoutBatching } from '@axiomhq/js';
import { LOG_EVENT_TYPES, type LogEventType } from '@repo/shared';
import { currentContext, markSeen, type LogContext } from './ctx';

/** The vocabulary lives in @repo/shared so the logger, the query route and the UI agree. */
export const EVENTS = LOG_EVENT_TYPES;

export type Evt = LogEventType;

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
  // The handshake itself: `evt=req` already carries method/path/status, so this
  // says only what a Meta subscription failure looks like from the inside.
  webhook: ['event', 'object', 'pageId', 'entryCount', 'messagingCount', 'changesCount', 'signatureValid', 'mode', 'verified', 'hasChallenge'],
  webhook_item: ['kind', 'externalId', 'commentId', 'parentId', 'verb', 'inserted', 'priorStatus', 'outcome', 'ageMs'],
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

/**
 * The one line a person reads in Axiom: who acted, what came of it, then the
 * numbers that explain it. Built from the fields that already survived
 * `filterFields`, so anything the content policy dropped is simply absent here.
 */
function describeEvent(evt: Evt, f: Fields): string {
  const parts: string[] = [];
  const add = (...bit: unknown[]): void => {
    const line = bit
      .filter((piece) => piece !== undefined && piece !== null && piece !== '')
      .map((piece) => String(piece))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
  };
  const state = (value: unknown): string => (value === true ? 'yes' : value === false ? 'no' : '');

  switch (evt) {
    case 'req':
      add(text(f.method) || '?', text(f.routePath) || text(f.path) || '?', '→', f.status ?? '?', span(f.durationMs, 'in'));
      break;
    case 'not_found':
      add('no route for', text(f.method) || '?', text(f.path) || '?');
      break;
    case 'error':
      // Unbounded: `message` is being replaced by this line, and the value
      // already left `filterFields` at the policy's own cap.
      add('error:', text(f.name) ? `${text(f.name)} —` : '', text(f.message, 0) || '(no message)');
      break;
    case 'auth':
      add('auth rejected:', text(f.reason) || 'no reason given', f.uid ? `uid ${text(f.uid)}` : '');
      break;
    case 'webhook':
      add(
        'webhook delivery',
        f.pageId ? `for page ${text(f.pageId)}` : '',
        f.object ? `object=${text(f.object)}` : '',
        f.event ? `event=${text(f.event)}` : '',
        f.entryCount !== undefined ? `${f.entryCount} entr${f.entryCount === 1 ? 'y' : 'ies'}` : '',
        f.messagingCount !== undefined ? `${f.messagingCount} messaging` : '',
        f.changesCount !== undefined ? `${f.changesCount} changes` : '',
        f.signatureValid === false ? 'SIGNATURE INVALID' : f.signatureValid === true ? 'signature valid' : '',
        f.mode ? `handshake mode=${text(f.mode)} verified=${state(f.verified) || 'unset'}` : '',
      );
      break;
    case 'webhook_item':
      add(
        'webhook item',
        text(f.kind) || 'unknown',
        text(f.externalId) || (f.commentId ? `#${text(f.commentId)}` : ''),
        f.verb ? `verb ${text(f.verb)}` : '',
        f.inserted === undefined ? '' : f.inserted ? 'stored' : 'already there',
        f.priorStatus ? `prior state ${text(f.priorStatus)}` : '',
        f.ageMs !== undefined ? `lock age ${span(f.ageMs)}` : '',
        f.outcome ? `→ ${text(f.outcome)}` : '',
      );
      break;
    case 'http_out':
      add(
        text(f.service) || 'outbound call',
        f.errorName ? `FAILED (${text(f.errorName)})` : `→ ${text(f.host) || '?'}${text(f.targetPath, 0)}`,
        f.httpMethod ? `${text(f.httpMethod)}${f.status !== undefined ? ` ${f.status}` : ''}` : '',
        span(f.durationMs, 'in'),
        f.ok === false ? 'not ok' : '',
      );
      break;
    case 'db':
      add(
        'db',
        text(f.operation) || '?',
        f.table ? `on ${text(f.table)}` : '',
        f.errorName ? `FAILED (${text(f.errorName)})` : f.rowCount !== undefined ? `${f.rowCount} row${f.rowCount === 1 ? '' : 's'}` : '',
        span(f.durationMs, 'in'),
        f.slow ? 'slow' : '',
      );
      break;
    case 'db_summary':
      add(
        'db rollup:',
        f.count !== undefined ? `${f.count} quer${f.count === 1 ? 'y' : 'ies'}` : '',
        f.table ? `on ${text(f.table)}` : '',
        f.totalMs !== undefined ? `${span(f.totalMs)} total` : '',
      );
      break;
    case 'agent_input':
      add(
        'agent handed',
        f.historyLength !== undefined ? `${f.historyLength} turn${f.historyLength === 1 ? '' : 's'}` : '',
        f.catalogCount !== undefined ? `and ${f.catalogCount} products` : '',
        f.systemPromptLength !== undefined ? `· prompt ${f.systemPromptLength} chars` : '',
      );
      break;
    case 'agent_run':
      add(
        'agent run',
        f.ok === true ? 'ok' : f.ok === false ? 'FAILED' : '',
        f.pendingClaimed !== undefined ? `${f.pendingClaimed} claimed` : '',
        f.repliedCount !== undefined ? `${f.repliedCount} retired` : '',
        f.sentViaTool !== undefined || f.sentViaFallback !== undefined
          ? `${num(f.sentViaTool) + num(f.sentViaFallback)} sent (${num(f.sentViaTool)} by tool, ${num(f.sentViaFallback)} by fallback)`
          : '',
        f.toolCallCount !== undefined ? `${f.toolCallCount} tool call${f.toolCallCount === 1 ? '' : 's'}` : '',
        f.stateSetTo ? `state → ${text(f.stateSetTo)}` : '',
        f.totalTokens !== undefined ? `${f.totalTokens} tokens${f.cacheHitPercent !== undefined ? ` (${f.cacheHitPercent}% cache hit)` : ''}` : '',
        f.estimatedCostUsd !== undefined ? `~$${f.estimatedCostUsd}` : '',
        span(f.durationMs, 'in'),
        f.reTriggered === undefined ? '' : f.reTriggered ? 're-triggered' : 'no follow-up',
        f.externalId ? `· ${text(f.externalId, 24)}` : '',
        f.replyText ? `— "${text(f.replyText, 90)}"` : '',
      );
      break;
    case 'tool_call':
      add('tool', text(f.tool) || '?', 'called with', text(f.args, 140) || '(no args)');
      break;
    case 'tool_result':
      add(
        'tool',
        text(f.tool) || '?',
        f.ok === false ? 'FAILED' : f.ok === true ? 'answered' : 'returned',
        span(f.durationMs, 'in'),
        f.result ? `→ ${text(f.result, 120)}` : '',
      );
      break;
    case 'bg':
      add(
        'background task',
        text(f.task) || '?',
        f.ok === false ? 'failed' : 'finished',
        span(f.durationMs, 'in'),
        f.message ? `· ${text(f.name) ? `${text(f.name)}: ` : ''}${text(f.message, 0)}` : '',
      );
      break;
    case 'anomaly':
      add(
        'INVARIANT BROKEN:',
        text(f.kind) || 'unknown',
        f.count !== undefined ? `(count ${f.count})` : '',
        f.detail !== undefined ? `— ${text(f.detail, 140)}` : '',
      );
      break;
    case 'log_dropped':
      add(`${f.droppedEvents ?? 0} log events dropped before ingest`);
      break;
    default:
      return text(f.message) || evt;
  }

  return parts.join(' · ');
}

/** Compact for reading: 1.16s rather than 1162.3, and nothing when absent. */
function span(ms: unknown, lead = ''): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const shown = ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms * 10) / 10}ms`;
  return `${lead} ${shown}`.trim();
}

/** A count to arithmetic on; a field the policy dropped reads as zero, not `NaN`. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** One line, collapsed whitespace, bounded — a log message, not a transcript. */
function text(value: unknown, max = 120): string {
  if (value === undefined || value === null) return '';
  const flat = (typeof value === 'string' ? value : JSON.stringify(value) ?? String(value))
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';
  if (max === 0) return flat;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Precomputed so `emit()` allocates nothing per event on the request path. */
const ALLOWED = new Map<Evt, ReadonlySet<string>>(
  EVENTS.map((evt) => [evt, new Set(ALLOWLIST[evt])] as const),
);

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

/** Upper bound of the in-process store that backs /api2/logs when ingest is off. */
const STORE_EVENTS = 1000;
const STORE_BYTES = 512 * 1024;

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

/** Oldest first; the queryable copy that exists while ingest is off. */
let stored: Queued[] = [];
let storedBytes = 0;

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

/** The dataset ingest writes to and the query route reads from — one source of truth. */
export function logDataset(): string {
  return dataset();
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
  const allowed = ALLOWED.get(evt);
  const out: Fields = {};
  for (const key of Object.keys(fields)) {
    if (!allowed?.has(key)) {
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
      // The detail is part of the fact: two Graph codes explaining two failed
      // sends are two facts, while the same claim lost twice is one.
      return `${evt}:${fields.kind ?? ''}:${fields.detail ?? ''}`;
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
 * Prints an event and queues it for the next flush. Allocates no timer and makes
 * no network call: all ingest happens in flush(), so a request is never slowed by
 * a log line, and a repeated fact is dropped rather than sent twice.
 */
export function emit(evt: Evt, fields: Fields = {}, opts: { dedupe?: string | null } = {}): void {
  try {
    const target = sink();

    const ctx = currentContext();
    const key = dedupeKey(evt, fields, ctx, opts.dedupe);
    if (key && !markSeen(key)) return;

    const event: Fields = { ...stamp(ctx), evt, ...filterFields(evt, fields, contentPolicy()) };
    // One plain-English sentence per event, built from the fields that survived
    // the content policy above, so it can never carry what the policy dropped.
    event.message = describeEvent(evt, event);

    let line: string;
    try {
      line = JSON.stringify(event);
    } catch {
      droppedEvents++;
      return;
    }

    // The owner reads the deployment's own log stream next to the query console, so
    // a line is printed whether or not it is also queued for ingest. Only the
    // silent sink is allowed to say nothing.
    if (target !== 'none') console.log(line);

    if (target === 'axiom') {
      queue.push({ event, size: line.length });
      queueBytes += line.length;
      const maxEvents = envInt('LOG_MAX_EVENTS', MAX_EVENTS);
      while (queue.length > maxEvents || (queueBytes > MAX_BYTES && queue.length > 0)) {
        const dropped = queue.shift();
        if (!dropped) break;
        queueBytes -= dropped.size;
        droppedEvents++;
      }
      if (queue.length >= FLUSH_EVENTS || queueBytes >= FLUSH_BYTES) void flush();
      return;
    }

    // Axiom holds the events while ingest is on; this process holds them while it
    // is not, so the same fact is never queryable from two places at once.
    recordStored(event, line.length);
  } catch {
    // A logging fault must never reach the caller or change a response.
  }
}

function recordStored(event: Fields, size: number): void {
  stored.push({ event, size });
  storedBytes += size;
  const max = envInt('LOG_STORE_MAX_EVENTS', STORE_EVENTS);
  while (stored.length > 1 && (stored.length > max || storedBytes > STORE_BYTES)) {
    const dropped = stored.shift();
    if (!dropped) break;
    storedBytes -= dropped.size;
  }
}

/** Newest first, and a copy: a query must not be able to mutate what is buffered. */
export function storedEvents(): Fields[] {
  const out: Fields[] = [];
  for (let i = stored.length - 1; i >= 0; i--) out.push(stored[i].event);
  return out;
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
    const lost: Fields = { ...stamp(undefined), evt: 'log_dropped', droppedEvents: dropped };
    lost.message = describeEvent('log_dropped', lost);
    events.push(lost);
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
  'webhook_unknown_page',
  'graph_send_failed',
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
  storedSize: () => stored.length,
  reset() {
    queue = [];
    queueBytes = 0;
    droppedEvents = 0;
    stored = [];
    storedBytes = 0;
    flushChain = Promise.resolve();
    axiomClient = undefined;
    forcedSink = undefined;
    injectedIngest = undefined;
    warnedFields.clear();
  },
};
