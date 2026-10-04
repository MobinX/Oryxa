import type { LogEventRow } from '@/lib/api';

/** The stamped envelope every row carries; it belongs in the detail, not the summary. */
const ENVELOPE = new Set(['requestId', 'runId', 'runDepth', 'env', 'release', 'message']);

/** Only for rows logged before the message field existed — then a few facts beat nothing. */
function describe(row: LogEventRow): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row.fields)) {
    if (ENVELOPE.has(key)) continue;
    if (typeof value === 'object' && value !== null) continue;
    parts.push(`${key}=${String(value)}`);
    if (parts.length === 4) break;
  }
  return parts.join(' · ') || '—';
}

export type Lane = { chip: string; dot: string; text: string; row?: string };

/**
 * One colour family per speaker, so a wall of rows separates by eye: the lanes
 * that describe ordinary traffic stay cool, the ones that describe a decision
 * turn violet, and the ones that mean something went wrong are the only rows
 * allowed to be red. Tailwind needs every class name written out, so each
 * family is spelled in full rather than built from the colour name.
 */
export const FAMILIES: Record<string, { chip: string; dot: string; text: string }> = {
  sky: { chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', text: 'text-sky-800 dark:text-sky-200' },
  cyan: { chip: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500', text: 'text-cyan-800 dark:text-cyan-200' },
  blue: { chip: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', text: 'text-blue-800 dark:text-blue-200' },
  indigo: { chip: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', text: 'text-indigo-800 dark:text-indigo-200' },
  slate: { chip: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-300' },
  stone: { chip: 'border-stone-500/40 bg-stone-500/10 text-stone-700 dark:text-stone-300', dot: 'bg-stone-500', text: 'text-stone-700 dark:text-stone-300' },
  violet: { chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', text: 'text-violet-800 dark:text-violet-200' },
  purple: { chip: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300', dot: 'bg-purple-500', text: 'text-purple-800 dark:text-purple-200' },
  fuchsia: { chip: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', text: 'text-fuchsia-800 dark:text-fuchsia-200' },
  teal: { chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', text: 'text-teal-800 dark:text-teal-200' },
  yellow: { chip: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500', text: 'text-yellow-800 dark:text-yellow-200' },
  amber: { chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-200' },
  orange: { chip: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', text: 'text-orange-800 dark:text-orange-200' },
  red: { chip: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300', dot: 'bg-red-500', text: 'text-red-800 dark:text-red-200' },
  rose: { chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', text: 'text-rose-800 dark:text-rose-300' },
};

export const LANES: Record<string, Lane> = {
  req: FAMILIES.sky,
  http_out: FAMILIES.cyan,
  webhook: FAMILIES.blue,
  webhook_item: FAMILIES.indigo,
  db: FAMILIES.slate,
  db_summary: FAMILIES.stone,
  agent_input: FAMILIES.violet,
  agent_run: FAMILIES.purple,
  tool_call: FAMILIES.fuchsia,
  tool_result: FAMILIES.teal,
  bg: FAMILIES.yellow,
  auth: { ...FAMILIES.amber, row: 'border-l-2 border-l-amber-500/60 bg-amber-500/5' },
  not_found: { ...FAMILIES.orange, row: 'border-l-2 border-l-orange-500/60 bg-orange-500/5' },
  error: { ...FAMILIES.red, row: 'border-l-2 border-l-destructive bg-destructive/5' },
  anomaly: { ...FAMILIES.rose, row: 'border-l-2 border-l-destructive bg-destructive/5' },
};

export const PLAIN_LANE: Lane = {
  chip: 'border-border/40 bg-muted text-muted-foreground',
  dot: 'bg-muted-foreground',
  text: 'text-foreground',
};

/**
 * `[webhook] the sentence the logger wrote`. The tag becomes the coloured chip,
 * so the row itself says only what happened.
 */
export function lineOf(row: LogEventRow): { tag: string; text: string } {
  const raw = typeof row.fields.message === 'string' ? row.fields.message.trim() : '';
  const tagged = /^\[([a-z_]+)\]\s*(.*)$/s.exec(raw);
  if (tagged) return { tag: tagged[1], text: tagged[2] || '—' };
  return { tag: row.evt.replace(/_/g, ' '), text: raw || describe(row) };
}
