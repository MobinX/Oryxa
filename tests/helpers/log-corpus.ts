import type { LogEventType } from '@repo/shared';

export type Fields = Record<string, unknown>;

/**
 * One representative event per type the logger is allowed to emit, with fields
 * taken from the allowlist in apps/api/src/lib/log.ts. Used to prove the query
 * route can reach every type — and that a field nobody declared is dropped
 * rather than silently widening the ingest schema.
 */
export const LOG_CORPUS: Array<{ evt: LogEventType; fields: Fields }> = [
  {
    evt: 'req',
    fields: { method: 'GET', path: '/api/v1/businesses', routePath: '/api/v1/businesses', status: 200, durationMs: 12.4 },
  },
  { evt: 'error', fields: { name: 'TypeError', message: 'x is not a function', stack: 'TypeError: x is not a function' } },
  { evt: 'not_found', fields: { method: 'GET', path: '/api/v1/missing' } },
  { evt: 'auth', fields: { reason: 'expired', uid: 'dev-test-uid' } },
  {
    evt: 'webhook',
    fields: { event: 'delivery', object: 'page', pageId: 'PAGE_1', entryCount: 1, messagingCount: 1, changesCount: 0, signatureValid: true },
  },
  { evt: 'webhook_item', fields: { kind: 'message', externalId: 'mid_1', inserted: true, outcome: 'agent_triggered' } },
  {
    evt: 'http_out',
    fields: { host: 'graph.facebook.com', targetPath: '/v19.0/me/messages', httpMethod: 'POST', status: 200, ok: true, durationMs: 221.5, service: 'facebook' },
  },
  { evt: 'db', fields: { table: 'conversations', operation: 'select', durationMs: 31.5, rowCount: 4, slow: false } },
  { evt: 'db_summary', fields: { table: 'messages', count: 7, totalMs: 44.2 } },
  {
    evt: 'agent_run',
    fields: { ok: true, pendingClaimed: 2, sentViaTool: 1, repliedCount: 1, toolCallCount: 3, stateSetTo: 'done', durationMs: 1512.8, replyText: 'Yes, we have it in red.', model: 'gpt-4o-mini' },
  },
  { evt: 'agent_input', fields: { historyLength: 6, turns: '[{"from":"customer"}]', catalogCount: 3, systemPromptLength: 820 } },
  { evt: 'tool_call', fields: { tool: 'send_message', toolCallId: 'tc_1', args: { text: 'Yes, we have it in red.' } } },
  { evt: 'tool_result', fields: { tool: 'send_message', toolCallId: 'tc_1', ok: true, durationMs: 40.2, result: 'sent' } },
  { evt: 'bg', fields: { task: 'fb-webhook', ok: false, name: 'Error', message: 'boom', durationMs: 3.1 } },
  { evt: 'anomaly', fields: { kind: 'backlog_claimed_but_unanswered', detail: 'mid_1', count: 2 } },
  { evt: 'log_dropped', fields: { droppedEvents: 3 } },
];
