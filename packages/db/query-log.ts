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
      safeReport(report, {
        ...summary,
        durationMs: elapsed(started),
        errorName: nameOf(err),
        ...causeOf(err),
      });
      throw err;
    }

    if (isLazyQuery(result)) {
      // `neon()` returns a thenable whose `then` runs the statement, so it has to
      // be adopted exactly once: observing a second copy would send every query
      // to Postgres twice, duplicating inserts and letting the copy that reports
      // win a conditional write the caller's copy then misses (`claim …`,
      // `on conflict do nothing`). The caller's own touch executes it, and this
      // line rides that same execution.
      let run: Promise<unknown> | undefined;
      const start = () =>
        (run ??= Promise.resolve(result).then(
          (value) => {
            safeReport(report, {
              ...summary,
              durationMs: elapsed(started),
              rowCount: rowCountOf(value),
            });
            return value;
          },
          (err: unknown) => {
            safeReport(report, {
              ...summary,
              durationMs: elapsed(started),
              errorName: nameOf(err),
              ...causeOf(err),
            });
            throw err;
          },
        ));

      return observableOnce(result, start);
    }

    if (isThenable(result)) {
      // Observation only: attaching handlers leaves the caller's promise, and its
      // rejection, intact. A native promise memoizes, so awaiting a copy is safe.
      Promise.resolve(result).then(
        (value) => {
          safeReport(report, {
            ...summary,
            durationMs: elapsed(started),
            rowCount: rowCountOf(value),
          });
        },
        (err: unknown) => {
          safeReport(report, {
            ...summary,
            durationMs: elapsed(started),
            errorName: nameOf(err),
            ...causeOf(err),
          });
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

const LAZY_QUERY_TAG = 'NeonQueryPromise';

/**
 * The shape `@neondatabase/serverless` builds for one http query: nothing is sent
 * until a handler is attached, and every `then`/`catch`/`finally` call sends the
 * statement again. Identified by the tag the driver itself puts on it.
 */
function isLazyQuery(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === LAZY_QUERY_TAG
  );
}

/**
 * The same query, run once: the caller's first touch adopts the driver's thenable
 * through `start`, and every later touch — including this logger's — shares that
 * one execution. `parameterizedQuery`, `opts` and the tag are carried over so
 * `sql.transaction([...])`, which reads them off the queued queries, still works.
 */
function observableOnce(lazy: Record<PropertyKey, unknown>, start: () => Promise<unknown>): unknown {
  const once: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(lazy)) {
    if (key === 'then' || key === 'catch' || key === 'finally') continue;
    Object.defineProperty(once, key, Object.getOwnPropertyDescriptor(lazy, key) as PropertyDescriptor);
  }

  once.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    start().then(onFulfilled, onRejected);
  once.catch = (onRejected?: (reason: unknown) => unknown) => start().catch(onRejected);
  once.finally = (onFinally?: () => unknown) => start().finally(onFinally);
  return once;
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

/**
 * The reason one level down from the driver's wrapper: `fetch failed` on its own
 * cannot tell DNS from a refused connection from our own timeout, but the cause
 * code can. Names and codes only — never messages, which may carry SQL text.
 */
function causeOf(err: unknown): Fields {
  const source = (err as { sourceError?: unknown } | null | undefined)?.sourceError;
  if (typeof source !== 'object' || source === null) return {};
  const fields: Fields = {};
  const name = (source as { name?: unknown }).name;
  if (typeof name === 'string' && name) fields.causeName = name;
  const code = (source as { cause?: { code?: unknown } | null | undefined }).cause?.code;
  if (typeof code === 'string' && code) fields.causeCode = code;
  else if (typeof code === 'number') fields.causeCode = code;
  return fields;
}

/** Budget for one database round trip. Past it the fetch is aborted and the query fails fast. */
export const DB_QUERY_TIMEOUT_MS = 30_000;

/**
 * Gives every ordinary query its own abort signal, merged into the options the
 * driver forwards to `fetch` — so a wedged connection fails the query in
 * seconds instead of hanging the request for the fetch default of 300. The
 * signal is minted per call (a shared one would fire once for all queries),
 * and template-tag calls pass through untouched since they carry no options.
 * Like the instrument above, this wrapper never touches the result, so layering
 * the two cannot execute a lazy query twice.
 */
export function withFetchTimeout<T>(raw: T, timeoutMs: number = DB_QUERY_TIMEOUT_MS): T {
  if (typeof raw !== 'function') return raw;

  const client = raw as unknown as SqlClient;
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    if (!args.length || typeof args[0] !== 'string') return client.apply(this, args);
    const [query, params, opts] = args;
    const base = (opts && typeof opts === 'object' ? opts : {}) as Record<string, unknown>;
    const existing = base.fetchOptions as Record<string, unknown> | undefined;
    return client.apply(this, [
      query,
      params,
      { ...base, fetchOptions: { ...existing, signal: AbortSignal.timeout(timeoutMs) } },
    ]);
  } as unknown as SqlClient;

  for (const key of Reflect.ownKeys(client)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(client, key) as PropertyDescriptor);
  }

  return wrapped as T;
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
