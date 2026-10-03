import { AsyncLocalStorage } from 'node:async_hooks';

export interface LogContext {
  requestId: string;
  runId: string;
  runDepth: number;
  userId?: string;
  businessId?: string;
  channelId?: string;
  conversationId?: string;
  commentThreadId?: string;
  /** Set by the notFound handler so the request middleware stays the single owner of this request. */
  notFoundHandled: boolean;
  /** Queries counted per table for the one `evt=db_summary` this invocation reports. */
  dbTally?: Map<string, DbTallyRow>;
  /** `evt:key` already emitted in this invocation; backs the "every log is unique" rule. */
  seen: Set<string>;
}

export interface DbTallyRow {
  count: number;
  totalMs: number;
}

const storage = new AsyncLocalStorage<LogContext>();

export function newId(): string {
  return crypto.randomUUID();
}

export function startContext(init: Partial<LogContext> = {}): LogContext {
  return {
    requestId: newId(),
    runId: newId(),
    runDepth: 0,
    notFoundHandled: false,
    seen: new Set<string>(),
    ...init,
  };
}

export function withContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * The context object is per-invocation and reached through the async chain, so
 * mutating it in place is what makes ids discovered deep inside a run (a
 * conversationId resolved by the runner, say) appear on every later event.
 */
export function tagContext(patch: Partial<LogContext>): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  Object.assign(ctx, patch);
}

/** Returns true only the first time `key` is seen in this invocation. */
export function markSeen(key: string): boolean {
  const ctx = storage.getStore();
  if (!ctx) return true;
  if (ctx.seen.has(key)) return false;
  ctx.seen.add(key);
  return true;
}

/**
 * Counts a query against its table. Outside a request context there is nothing to
 * count them for, so a script run costs nothing here.
 */
export function tallyDbCall(table: string, durationMs: number): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  const tally = (ctx.dbTally ??= new Map<string, DbTallyRow>());
  const row = tally.get(table);
  if (row) {
    row.count += 1;
    row.totalMs += durationMs;
    return;
  }
  tally.set(table, { count: 1, totalMs: durationMs });
}

/** Emptied on read, so a context can only ever report its rollup once. */
export function drainDbTally(): Array<[string, DbTallyRow]> {
  const ctx = storage.getStore();
  if (!ctx?.dbTally) return [];
  const rows = [...ctx.dbTally.entries()];
  ctx.dbTally.clear();
  return rows;
}

/** Carried across the internal re-trigger hop; read only by the request middleware. */
export const RUN_ID_HEADER = 'x-run-id';
export const RUN_DEPTH_HEADER = 'x-run-depth';

/**
 * The child inherits this run's id so one customer turn stays one chain, and its
 * depth is one more so a self-perpetuating loop is visible as one. Headers rather
 * than body fields — the `/internal/run` payload contract stays byte-identical.
 */
export function outboundRunHeaders(): Record<string, string> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  return { [RUN_ID_HEADER]: ctx.runId, [RUN_DEPTH_HEADER]: String(ctx.runDepth + 1) };
}
