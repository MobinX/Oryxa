import { Info } from 'lucide-react';
import { clockInZone } from '@/lib/logs-time';
import { LANES, PLAIN_LANE, lineOf } from '@/lib/log-lanes';
import type { LogEventRow } from '@/lib/api';

/**
 * One event, as the console shows it and as the dashboard's recent strip shows it —
 * same lane colour, same open-to-see-the-fields detail, so a row never looks like two
 * different things in two places. `compact` drops the date from the clock and clamps
 * the line, which is enough for a strip that only ever shows the last few minutes.
 */
export function EventRow({
  row,
  zone,
  compact = false,
}: {
  row: LogEventRow;
  zone: string;
  compact?: boolean;
}) {
  const lane = LANES[row.evt] ?? PLAIN_LANE;
  const { tag, text } = lineOf(row);
  const clock = clockInZone(row.time, zone);

  return (
    <li className={`px-6 ${compact ? 'py-1.5' : 'py-2.5'} ${lane.row ?? ''}`}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-x-3">
          <span className="shrink-0 pt-1 font-mono text-xs text-muted-foreground">
            {compact ? clock.slice(11) : clock}
          </span>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${lane.chip}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${lane.dot}`} />
            {tag}
          </span>
          <span className={`min-w-0 flex-1 text-sm ${compact ? 'truncate' : 'line-clamp-2'} ${lane.text}`}>
            {text}
          </span>
          <span className="shrink-0 pt-0.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground group-open:text-foreground">
            <Info className="h-4 w-4" aria-hidden />
            <span className="sr-only">Show the fields behind this line</span>
          </span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-element border border-border/40 bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {JSON.stringify({ time: row.time, evt: row.evt, ...row.fields }, null, 2)}
        </pre>
      </details>
    </li>
  );
}
