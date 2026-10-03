type Fields = Record<string, unknown>;

/**
 * Every query, not a sample: the caller owns the policy of what becomes an event,
 * because only it knows that a rollup must count all queries while the rows shown
 * for them are deliberately thinned.
 */
export type DatabaseLogSink = (fields: Fields) => void;

let sink: DatabaseLogSink | undefined;

export function setDatabaseLogSink(next: DatabaseLogSink | undefined): void {
  sink = next;
}

interface SqlClient {
  (...args: unknown[]): unknown;
  [key: string]: unknown;
}

/**
 * Wraps the function `neon()` returns, because drizzle's http session calls it
 * directly — one wrapper covers every query in the app and, unlike Drizzle's
 * `logger`, sees duration, failure and row count instead of only the statement.
 *
 * Deliberately transparent: the inner call's value is handed back unchanged
 * (identity included, so drizzle's own chaining is untouched), `transaction` and
 * any other own property are copied onto the wrapper, and with no sink wired the
 * inner function is called directly — so a script importing this package without
 * the API behaves exactly as before.
 */
export function instrumentSql<T>(raw: T): T {
  if (typeof raw !== 'function') return raw;

  const client = raw as unknown as SqlClient;
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    const report = sink;
    if (!report) return client.apply(this, args);

    const summary = summarizeQuery(args[0]);
    const started = performance.now();
    let result: unknown;
    try {
      result = client.apply(this, args);
    } catch (err) {
      safeReport(report, { ...summary, durationMs: elapsed(started), errorName: nameOf(err) });
      throw err;
    }

    if (isThenable(result)) {
      // Observation only: attaching handlers leaves the caller's promise, and its
      // rejection, intact.
      Promise.resolve(result).then(
        (value) => {
          safeReport(report, {
            ...summary,
            durationMs: elapsed(started),
            rowCount: rowCountOf(value),
          });
        },
        (err: unknown) => {
          safeReport(report, { ...summary, durationMs: elapsed(started), errorName: nameOf(err) });
        },
      );
    } else {
      safeReport(report, { ...summary, durationMs: elapsed(started) });
    }

    return result;
  } as unknown as SqlClient;

  for (const key of Reflect.ownKeys(client)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(client, key) as PropertyDescriptor);
  }

  return wrapped as T;
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

function safeReport(report: DatabaseLogSink, fields: Fields): void {
  try {
    report(fields);
  } catch {
    // A query is never failed by the line describing it.
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function';
}

function nameOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function rowCountOf(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  const rows = (value as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? rows.length : undefined;
}

const OPERATION_RE = /^\s*(?:\(\s*)?(?:\/\*[\s\S]*?\*\/\s*)?([A-Za-z]+)/;
const TABLE_RE = /\b(?:from|into|update|join)\s+("?[A-Za-z_][A-Za-z0-9_$]*"?(?:\."?[A-Za-z_][A-Za-z0-9_$]*"?)?)/i;

/**
 * Verb and table only. The statement itself would put customer text — message
 * bodies, names, addresses — into the log store on every successful query.
 */
function summarizeQuery(sql: unknown): Fields {
  if (typeof sql !== 'string') return { operation: 'batch' };
  const operation = OPERATION_RE.exec(sql)?.[1]?.toLowerCase();
  const table = TABLE_RE.exec(sql)?.[1]?.replace(/"/g, '').toLowerCase();
  return {
    ...(operation ? { operation } : {}),
    ...(table ? { table } : {}),
  };
}
