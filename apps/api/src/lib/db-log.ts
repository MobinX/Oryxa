import { setDatabaseLogSink } from '@repo/db/query-log';
import { drainDbTally, tallyDbCall } from './ctx';
import { emit } from './log';

const SLOW_MS = 200;
/** Percent of ordinary queries kept. Failures and slow queries are always kept. */
const SAMPLE_PERCENT = 10;

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Drizzle's neon-http session funnels every query through the one function this
 * wraps, so `evt=db` covers the whole app without touching a crud file. Full
 * per-query logging is far the largest volume dial in this design and can carry
 * customer text, hence: everything counted into `evt=db_summary`, only failures,
 * slow queries and a sample emitted as rows.
 */
export function wireDatabaseLogging(): void {
  setDatabaseLogSink((fields) => {
    try {
      const durationMs = typeof fields.durationMs === 'number' ? fields.durationMs : 0;
      const table = typeof fields.table === 'string' ? fields.table : 'unknown';
      tallyDbCall(table, durationMs);

      const slow = durationMs >= numberFromEnv('SLOW_DB_MS', SLOW_MS);
      const failed = fields.errorName !== undefined;
      if (!failed && !slow && Math.random() * 100 >= numberFromEnv('LOG_DB_SAMPLE', SAMPLE_PERCENT)) return;

      emit('db', {
        table,
        operation: fields.operation,
        durationMs,
        rowCount: fields.rowCount,
        slow,
        errorName: fields.errorName,
      });
    } catch {
      // Instrumentation never fails the query it describes.
    }
  });
}

/** One row per table touched by this invocation; called where the request ends. */
export function emitDbSummary(): void {
  for (const [table, row] of drainDbTally()) {
    emit('db_summary', {
      table,
      count: row.count,
      totalMs: Math.round(row.totalMs * 10) / 10,
    });
  }
}
