import { AxiomWithoutBatching } from '@axiomhq/js';
import type { LogEventRow, LogQueryResponse, LogQuerySource } from '@repo/shared';
import { logDataset, logsToAxiom, storedEvents, type Evt } from './log';

type Fields = Record<string, unknown>;

export interface LogFilter {
  evt?: Evt;
  /** ISO instants. Both are always resolved: a log store without a window is unbounded. */
  startTime: string;
  endTime: string;
  limit: number;
  /** Exclusive upper time bound to page from, produced by `encodeCursor`. */
  cursor?: string;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A wider window than this is rejected rather than billed: retention is 30 days. */
export const MAX_WINDOW_MS = 31 * DAY_MS;
/**
 * One hour: with no `start` the browser shows what just happened, and paging is
 * what takes the reader back — each page narrows the upper bound, so an
 * un-narrowed hour is the entry point to older ones rather than a limit on them.
 */
export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Paging is a time window, not a store cursor: `nextCursor` decodes to the oldest
 * time on the page and the next call ends there. One mechanism therefore works
 * against Axiom and against the in-process store, so local behaviour is the same
 * contract the deployed one runs on. Events sharing a millisecond with a boundary
 * can land on the older page and be missed; a log browser trades that for having
 * no offset to get out of sync.
 */
export function encodeCursor(time: string): string {
  return Buffer.from(time, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string | undefined {
  let raw: string;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function logQuerySource(): LogQuerySource {
  return logsToAxiom() ? 'axiom' : 'memory';
}

/**
 * `AXIOM_TOKEN` is expected to be ingest-only, so a read-capable token goes in
 * its own variable and the ingest secret is never used to browse.
 */
export function queryToken(): string | undefined {
  const token = process.env.AXIOM_QUERY_TOKEN ?? process.env.AXIOM_TOKEN;
  return token && token !== '' ? token : undefined;
}

/** The single place the APL grammar is asserted; a live mismatch is fixed here. */
export function buildApl(filter: LogFilter): string {
  const dataset = logDataset().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const parts = [`['${dataset}']`];
  if (filter.evt) parts.push(`where evt == '${filter.evt}'`);
  parts.push('sort by _time desc', `limit ${filter.limit}`);
  return parts.join(' | ');
}

export async function queryLogs(filter: LogFilter): Promise<LogQueryResponse> {
  return logQuerySource() === 'axiom' ? queryAxiom(filter) : queryMemory(filter);
}

function windowOf(filter: LogFilter) {
  return { startTime: filter.startTime, endTime: filter.endTime };
}

/**
 * A row is the fields it actually carries. Axiom's legacy format answers every
 * field of the dataset with `null` where this event wrote nothing, and a log
 * browser has no use for "absent" repeated forty times — so both providers are
 * normalised to the same shape, and the in-process store never holds nulls anyway.
 */
function toRow(time: string, event: Fields): LogEventRow {
  const fields: Fields = {};
  for (const key of Object.keys(event)) {
    if (key === 'time' || key === 'evt') continue;
    if (event[key] === null || event[key] === undefined) continue;
    fields[key] = event[key];
  }
  return { time, evt: typeof event.evt === 'string' ? event.evt : '', fields };
}

function newestFirst(a: LogEventRow, b: LogEventRow): number {
  return Date.parse(b.time) - Date.parse(a.time);
}

function queryMemory(filter: LogFilter): LogQueryResponse {
  const from = Date.parse(filter.startTime);
  const to = Date.parse(filter.endTime);
  const rows: LogEventRow[] = [];

  for (const event of storedEvents()) {
    const time = event.time;
    if (typeof time !== 'string') continue;
    const at = Date.parse(time);
    if (Number.isNaN(at) || at < from || at >= to) continue;
    if (filter.evt && event.evt !== filter.evt) continue;
    rows.push(toRow(time, event));
  }

  rows.sort(newestFirst);
  const events = rows.slice(0, filter.limit);
  return {
    events,
    nextCursor:
      events.length === filter.limit && rows.length > events.length
        ? encodeCursor(events[events.length - 1].time)
        : undefined,
    window: windowOf(filter),
    limit: filter.limit,
    source: 'memory',
  };
}

let axiomQueryClient: AxiomWithoutBatching | undefined;
/** The call the SDK makes; a stub only has to satisfy this, not all of `typeof fetch`. */
type QueryFetch = (input: unknown, init?: unknown) => Promise<Response>;
let queryFetch: QueryFetch | undefined;

function axiomClient(): AxiomWithoutBatching {
  if (!axiomQueryClient) {
    axiomQueryClient = new AxiomWithoutBatching({
      token: queryToken() ?? '',
      onError: () => {},
      ...(queryFetch ? { fetch: queryFetch as typeof globalThis.fetch } : {}),
    });
  }
  return axiomQueryClient;
}

/** Test seam: keeps the route's paging contract exercisable without live credentials. */
export const __testOnly = {
  setQueryClient(client: AxiomWithoutBatching | undefined) {
    axiomQueryClient = client;
  },
  /**
   * Replaces the transport inside the real client, so the request the SDK actually
   * builds — URL, method, body, auth header — is assertable without a token.
   */
  setQueryFetch(fetch: QueryFetch | undefined) {
    queryFetch = fetch;
    axiomQueryClient = undefined;
  },
};

async function queryAxiom(filter: LogFilter): Promise<LogQueryResponse> {
  const result = await axiomClient().query(buildApl(filter), {
    startTime: filter.startTime,
    endTime: filter.endTime,
    format: 'legacy',
  });

  const rows: LogEventRow[] = [];
  for (const match of result.matches ?? []) {
    const time = match._time ?? (typeof match.data?.time === 'string' ? match.data.time : undefined);
    if (!time || !match.data) continue;
    rows.push(toRow(time, match.data as Fields));
  }
  rows.sort(newestFirst);

  const events = rows.slice(0, filter.limit);
  return {
    events,
    nextCursor: events.length === filter.limit ? encodeCursor(events[events.length - 1].time) : undefined,
    window: windowOf(filter),
    limit: filter.limit,
    source: 'axiom',
  };
}
