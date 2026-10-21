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
  webhook_item: ['kind', 'externalId', 'commentId', 'parentId', 'verb', 'inserted', 'priorStatus', 'outcome', 'ageMs', 'senderId', 'fromId', 'fromName', 'text'],
  // The Instagram pipeline's own lane: one row per stage, so a delivery can be followed from
  // envelope to agent trigger without reading the Messenger rows. Signed URLs, tokens and raw
  // payloads are deliberately absent; `text` follows the same LOG_CONTENT policy as elsewhere.
  instagram: [
    'stage', 'accountId', 'entryCount', 'messagingCount', 'changesCount', 'signatureValid', 'sourcePath',
    'eventType', 'senderId', 'externalId', 'commentId', 'mediaId', 'parentId', 'field', 'fromId', 'fromName', 'text',
    'imageCount', 'hasAudio', 'quickReply', 'postbackTitle', 'detailsKind', 'productId', 'variantId',
    'inserted', 'priorStatus', 'needsProfile', 'outcome', 'ageMs', 'handled', 'reason', 'bytes', 'contentType',
    'transcriptChars', 'profileResolved', 'hasName', 'hasAvatar', 'ok', 'fetched', 'durationMs', 'count', 'stored', 'failed',
    'instagramId', 'pageId', 'resolved',
  ],
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
 * The one line a person reads in Axiom. It says who is speaking, what happened,
 * then the numbers — so a Messenger turn reads as a story: `[webhook]` the
 * delivery, `[webhook]` the message stored and the run it started, `[db]` the
 * write, `[agent]` what the model was shown, `[tool]` what it decided to send,
 * `[agent]` how the run ended.
 *
 * Built from the fields that already survived `filterFields`, so anything the
 * content policy dropped is simply absent here.
 */

/** Which part of the system is speaking, so one lane can be filtered at a glance. */
const LANE: Record<Evt, string> = {
  req: '[api]',
  error: '[error]',
  not_found: '[api]',
  auth: '[auth]',
  webhook: '[webhook]',
  webhook_item: '[webhook]',
  instagram: '[ig]',
  http_out: '[net]',
  db: '[db]',
  db_summary: '[db]',
  agent_input: '[agent]',
  agent_run: '[agent]',
  tool_call: '[tool]',
  tool_result: '[tool]',
  bg: '[bg]',
  anomaly: '[alert]',
  log_dropped: '[log]',
};

/** The webhook's outcome codes, in the words an owner reads rather than the code. */
const OUTCOME: Record<string, string> = {
  agent_triggered: 'starting the agent run',
  comment_run_triggered: 'starting the comment agent run',
  redelivered: 'Meta re-sent one we already have',
  redelivered_stale_recovered: 'the run it waited on is dead — lock reset, run restarted',
  stale_runner_recovered: 'the run holding the lock is dead — lock reset, run restarted',
  redelivered_pending_drained: 'an unanswered backlog is waiting — starting a run',
  waited_for_live_runner: 'another run already holds this conversation',
  quota_exhausted: 'ALLOWANCE USED UP — the agent was not started',
  no_agent: 'NO AGENT ATTACHED — nobody will answer this customer',
  not_triggered: 'no run started',
  unsupported_content: 'nothing to answer (attachment, sticker or audio)',
  incomplete_payload: 'payload has no id or text — cannot be routed',
  unknown_account: 'no live Instagram channel for this account',
  no_business: 'the channel has no business',
  details_handled: 'details answered without the model',
  details_unhandled: 'details could not be produced',
  profile_unresolved: 'Instagram did not release a profile',
  transcription_failed: 'the voice note could not be transcribed',
  image_copy_failed: 'a photo could not be copied to the store bucket',
  malformed_json: 'the body was not valid JSON',
  unhandled_shape: 'the envelope was not a Page or Instagram delivery',
  echo: 'the account’s own message or comment',
  live_comment_skipped: 'live comments are not answered',
  ignored_field: 'a webhook field this app does not consume',
};

/** How much of the transcript fits in the line before the structured field is the better read. */
const HISTORY_IN_LINE = 900;

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
  const plural = (value: unknown, one: string, many: string): string =>
    typeof value === 'number' ? `${value} ${value === 1 ? one : many}` : '';

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
      add('rejected:', text(f.reason) || 'no reason given', f.uid ? `uid ${text(f.uid)}` : '');
      break;
    case 'webhook': {
      const kind = text(f.event);
      if (kind === 'verify') {
        add(
          'Meta is setting up the subscription',
          f.mode ? `mode ${text(f.mode)}` : '',
          f.verified === true ? 'VERIFY OK — challenge sent back' : 'VERIFY REJECTED — verify token did not match',
          f.hasChallenge === false ? 'and no challenge was sent' : '',
        );
      } else if (kind === 'testing_forward') {
        add('testing mode — passing this delivery on to the live webhook');
      } else if (f.entryCount === undefined) {
        add('Meta POSTed a body that would not parse as JSON', f.signatureValid === false ? 'and the signature did not verify' : '');
      } else {
        const carried = [
          plural(f.messagingCount, 'messaging event', 'messaging events'),
          plural(f.changesCount, 'comment change', 'comment changes'),
        ]
          .filter(Boolean)
          .join(' + ');
        add(
          'Meta delivered',
          carried || 'nothing actionable',
          f.pageId ? `for page ${text(f.pageId)}` : '',
          f.object ? `(object ${text(f.object)})` : '',
          f.signatureValid === false ? 'SIGNATURE INVALID — accepted anyway' : f.signatureValid === true ? 'signature valid' : '',
        );
      }
      break;
    }
    case 'webhook_item': {
      const code = text(f.outcome);
      const senderId = text(f.senderId) || text(f.fromId);
      const who = [text(f.fromName, 60), senderId ? `id ${senderId}` : ''].filter(Boolean).join(' ');
      const said = text(f.text, 160);
      add(
        text(f.kind) === 'comment' ? 'comment' : 'message',
        said ? `"${said}"` : '(no text)',
        who ? `from ${who}` : 'from an unidentified sender',
        text(f.externalId) ? `mid ${text(f.externalId, 24)}` : f.commentId ? `comment #${text(f.commentId, 24)}` : '',
        f.parentId ? `replying to #${text(f.parentId, 24)}` : '',
        f.verb ? `verb ${text(f.verb)}` : '',
        f.inserted === undefined ? '' : f.inserted ? `written to the ${text(f.kind) === 'comment' ? 'comments' : 'messages'} table` : 'already in the database',
        f.priorStatus ? `conversation was ${text(f.priorStatus)}` : '',
        f.ageMs !== undefined ? `lock held for ${span(f.ageMs)}` : '',
        code ? `→ ${OUTCOME[code] ?? code}` : '',
      );
      break;
    }
    case 'instagram': {
      const stage = text(f.stage) || 'event';
      const code = text(f.outcome);
      if (stage === 'delivery') {
        add(
          'IG delivery',
          f.signatureValid === false ? 'SIGNATURE INVALID — accepted anyway' : 'signature valid',
          plural(f.entryCount, 'entry', 'entries'),
          plural(f.messagingCount, 'DM event', 'DM events'),
          plural(f.changesCount, 'comment change', 'comment changes'),
          f.sourcePath ? `via ${text(f.sourcePath)}` : '',
        );
      } else if (stage === 'entry' || stage === 'entry_dropped') {
        add(
          stage === 'entry_dropped' ? 'IG entry DROPPED' : 'IG entry',
          f.accountId ? `account ${text(f.accountId)}` : '',
          plural(f.messagingCount, 'DM event', 'DM events'),
          plural(f.changesCount, 'comment change', 'comment changes'),
          f.resolved === false ? 'no live channel' : f.resolved === true ? 'channel resolved' : '',
          code ? `→ ${OUTCOME[code] ?? code}` : '',
        );
      } else if (stage === 'dm_event') {
        add(
          'IG DM',
          text(f.eventType) || 'event',
          text(f.text, 160) ? `"${text(f.text, 160)}"` : '(no text)',
          f.senderId ? `from ${text(f.senderId)}` : '',
          text(f.externalId) ? `mid ${text(f.externalId, 24)}` : '',
          f.imageCount ? plural(f.imageCount, 'photo', 'photos') : '',
          f.hasAudio ? 'voice note' : '',
          text(f.quickReply) ? `quick reply ${text(f.quickReply, 40)}` : '',
          text(f.postbackTitle) ? `postback "${text(f.postbackTitle, 60)}"` : '',
        );
      } else if (stage === 'details') {
        add(
          'IG Details tap',
          text(f.detailsKind) || '?',
          f.handled === true ? 'answered deterministically' : 'could not be answered',
          f.reason ? `— ${text(f.reason, 140)}` : '',
          text(f.productId) ? `product ${text(f.productId, 36)}` : '',
          text(f.variantId) ? `variant ${text(f.variantId, 36)}` : '',
        );
      } else if (stage === 'audio') {
        add(
          'IG voice note',
          f.ok === true ? 'transcribed' : 'NOT transcribed',
          f.bytes !== undefined ? `${f.bytes} bytes` : '',
          text(f.contentType) ? `(${text(f.contentType)})` : '',
          f.transcriptChars !== undefined ? `${f.transcriptChars} transcript chars` : '',
          span(f.durationMs, 'in'),
          f.reason ? `— ${text(f.reason, 140)}` : '',
        );
      } else if (stage === 'profile') {
        add(
          'IG profile',
          f.profileResolved === true ? 'resolved' : 'not available',
          f.hasName ? 'name' : 'no name',
          f.hasAvatar ? 'avatar' : 'no avatar',
          f.senderId ? `for ${text(f.senderId)}` : '',
        );
      } else if (stage === 'images') {
        add(
          'IG photos',
          plural(f.count, 'attempted', 'attempted'),
          f.stored !== undefined ? `${f.stored} stored` : '',
          num(f.failed) > 0 ? `${f.failed} FAILED` : '',
        );
      } else if (stage === 'dm_result') {
        add(
          'IG DM',
          text(f.eventType) || 'event',
          code ? `→ ${OUTCOME[code] ?? code}` : 'skipped',
          f.senderId ? `from ${text(f.senderId)}` : 'no sender',
          text(f.externalId) ? `mid ${text(f.externalId, 24)}` : '',
        );
      } else if (stage === 'persisted') {
        add(
          'IG message',
          f.inserted === true ? 'written' : 'already stored',
          f.priorStatus ? `conversation was ${text(f.priorStatus)}` : '',
          f.needsProfile ? 'profile missing' : '',
        );
      } else if (stage === 'trigger') {
        add(
          'IG run',
          code ? `→ ${OUTCOME[code] ?? code}` : 'trigger checked',
          f.ageMs !== undefined ? `lock held for ${span(f.ageMs)}` : '',
        );
      } else if (stage === 'comment_event') {
        add(
          'IG comment',
          text(f.text, 160) ? `"${text(f.text, 160)}"` : '(no text)',
          f.fromName ? `from @${text(f.fromName, 60)}` : f.fromId ? `from ${text(f.fromId)}` : '',
          text(f.commentId) ? `#${text(f.commentId, 24)}` : '',
          text(f.mediaId) ? `on media ${text(f.mediaId, 24)}` : '',
          f.parentId ? `replying to #${text(f.parentId, 24)}` : '',
          f.field ? `field ${text(f.field)}` : '',
        );
      } else if (stage === 'comment_persisted') {
        add(
          'IG comment',
          f.inserted === true ? 'written' : 'already stored',
          f.priorStatus ? `thread was ${text(f.priorStatus)}` : '',
          f.fromName ? `from @${text(f.fromName, 60)}` : '',
          f.needsProfile ? 'profile missing' : '',
        );
      } else if (stage === 'comment_result') {
        add(
          'IG comment stored',
          f.inserted === true ? 'written' : 'already stored',
          f.priorStatus ? `thread was ${text(f.priorStatus)}` : '',
          code ? `→ ${OUTCOME[code] ?? code}` : '',
          f.ageMs !== undefined ? `lock held for ${span(f.ageMs)}` : '',
        );
      } else if (stage === 'account_lookup') {
        add(
          'IG OAuth lookup',
          plural(f.entryCount, 'Page', 'Pages'),
          f.count !== undefined ? `${f.count} linked account${f.count === 1 ? '' : 's'}` : '',
          f.resolved === false ? 'NOTHING CONNECTABLE' : '',
          f.reason ? `— ${text(f.reason, 140)}` : '',
        );
      } else if (stage === 'connect_account') {
        add(
          'IG connect',
          f.instagramId ? `account ${text(f.instagramId)}` : '',
          f.pageId ? `page ${text(f.pageId)}` : '',
          f.ok === true ? 'accepted' : 'FAILED',
          f.reason ? `— ${text(f.reason, 140)}` : '',
        );
      } else if (stage === 'subscribe') {
        add(
          'IG webhook subscription',
          f.ok === true ? 'subscribed' : 'FAILED',
          f.pageId ? `page ${text(f.pageId)}` : '',
          f.instagramId ? `account ${text(f.instagramId)}` : '',
          f.reason ? `— ${text(f.reason, 140)}` : '',
        );
      } else {
        add(
          'IG',
          stage,
          text(f.reason, 140) || text(f.text, 160),
          code ? `→ ${OUTCOME[code] ?? code}` : '',
        );
      }
      break;
    }
    case 'http_out':
      add(
        text(f.service) || 'an outbound call',
        f.errorName ? `FAILED (${text(f.errorName)})` : `reached ${text(f.host) || '?'}${text(f.targetPath, 0)}`,
        f.httpMethod ? `${text(f.httpMethod)}${f.status !== undefined ? ` → ${f.status}` : ''}` : '',
        span(f.durationMs, 'in'),
        f.ok === false ? 'not ok' : '',
      );
      break;
    case 'db': {
      const verb = text(f.operation) || 'query';
      const writing = verb === 'insert' || verb === 'update' || verb === 'delete';
      add(
        writing ? `writing (${verb})` : verb,
        f.table ? `${writing ? 'to' : 'on'} ${text(f.table)}` : '',
        f.errorName ? `FAILED (${text(f.errorName)})` : plural(f.rowCount, 'row', 'rows'),
        span(f.durationMs, 'in'),
        f.slow ? 'slow' : '',
      );
      break;
    }
    case 'db_summary':
      add(
        'rollup:',
        plural(f.count, 'query', 'queries'),
        f.table ? `on ${text(f.table)}` : '',
        f.totalMs !== undefined ? `${span(f.totalMs)} total` : '',
      );
      break;
    case 'agent_input':
      add(
        'run start — the model is shown',
        plural(f.historyLength, 'turn', 'turns'),
        f.catalogCount !== undefined ? `and ${f.catalogCount} products` : '',
        f.systemPromptLength !== undefined ? `prompt ${f.systemPromptLength} chars` : '',
      );
      add(dialog(f.turns, HISTORY_IN_LINE));
      break;
    case 'agent_run': {
      const byTool = num(f.sentViaTool);
      const direct = num(f.sentViaFallback);
      const sent =
        f.sentViaTool === undefined && f.sentViaFallback === undefined
          ? ''
          : byTool + direct === 0
            ? 'NOTHING SENT — this customer got no reply'
            : direct > 0 && byTool > 0
              ? `${byTool + direct} sent (${byTool} by display tool, ${direct} final replies)`
              : direct > 0
                ? `${direct} sent directly as the final model reply`
                : `${byTool} sent by display tool`;
      add(
        f.ok === false ? 'run FAILED' : 'run over',
        plural(f.pendingClaimed, 'message', 'messages'),
        'claimed,',
        plural(f.repliedCount, 'message', 'messages'),
        'marked answered',
        sent,
        plural(f.toolCallCount, 'tool call', 'tool calls'),
        f.stateSetTo ? `state → ${text(f.stateSetTo)}` : '',
        f.totalTokens !== undefined
          ? `${f.totalTokens} tokens${f.cacheHitPercent !== undefined ? ` (${f.cacheHitPercent}% from cache)` : ''}`
          : '',
        f.estimatedCostUsd !== undefined ? `~$${f.estimatedCostUsd}` : '',
        span(f.durationMs, 'in'),
        f.reTriggered === undefined ? '' : f.reTriggered ? 'more arrived — another run follows' : 'nothing left pending',
        f.replyText ? `reply: "${text(f.replyText, 120)}"` : '',
      );
      break;
    }
    case 'tool_call':
      add('the model calls', text(f.tool) || 'a tool', argsLine(f.args, 220));
      break;
    case 'tool_result':
      add(
        text(f.tool) || 'a tool',
        f.ok === false ? 'FAILED' : f.ok === true ? 'answered' : 'returned',
        span(f.durationMs, 'in'),
        f.result ? `→ ${bodyOf(f.result, 160)}` : '',
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
      return `${LANE[evt]} ${text(f.message) || evt}`;
  }

  return `${LANE[evt]} ${parts.join(' · ')}`;
}

/** A JSON field the logger stringified, or `undefined` when it is not JSON at all. */
function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  const first = value.charAt(0);
  if (first !== '[' && first !== '{') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** What the model was shown, oldest turns dropped first — the newest ones explain the reply. */
function dialog(value: unknown, max: number): string {
  const turns = parsed(value);
  if (!Array.isArray(turns)) return text(value, max);
  const lines = turns.map((turn) => {
    const row = (turn ?? {}) as Fields;
    return `${text(row.from, 12) || '?'}: "${text(row.content, 160) || '(empty)'}"`;
  });
  for (let dropped = 0; dropped < lines.length; dropped++) {
    const line = `${dropped ? `${dropped} earlier turn${dropped === 1 ? '' : 's'} · ` : ''}${lines.slice(dropped).join(' | ')}`;
    if (line.length <= max || dropped === lines.length - 1) return line.length > max ? text(line, max) : line;
  }
  return '';
}

/** A tool's arguments, said as the reply text when that is what was passed. */
function argsLine(value: unknown, max: number): string {
  const args = parsed(value);
  if (!args || Array.isArray(args) || typeof args !== 'object') {
    const raw = text(value, max);
    return raw ? `with ${raw}` : '(no args)';
  }
  const record = args as Fields;
  const said = typeof record.text === 'string' ? `"${text(record.text, max)}"` : '';
  const rest = Object.keys(record)
    .filter((key) => key !== 'text')
    .map((key) => `${key}=${text(record[key], 60)}`)
    .join(' ');
  const line = [said, rest].filter(Boolean).join(' ');
  return line ? `with ${line}` : '(no args)';
}

/** A tool's return value, unwrapped when the logger stored it as a JSON string. */
function bodyOf(value: unknown, max: number): string {
  const structured = parsed(value);
  if (typeof structured === 'string') return `"${text(structured, max)}"`;
  return text(value, max);
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
const CUSTOMER_TEXT = new Set([
  'content',
  'text',
  'replyText',
  'turns',
  'args',
  'result',
  'fromName',
  'quickReply',
  'postbackTitle',
]);
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
  'comment_reply_blocked',
  'double_send',
  'run_loop_depth',
  'token_metrics_unrecorded',
  'error_state_done',
  'tool_call_unresolved',
  'duplicate_reply_prevented',
  'webhook_unknown_page',
  'inbound_photo_lost',
  'graph_send_failed',
  'quota_exhausted',
  'quota_gate_failed',
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
