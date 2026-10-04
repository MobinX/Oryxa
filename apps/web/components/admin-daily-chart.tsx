'use client';

import { useState } from 'react';
import type { AdminDailyPoint } from '@/lib/api';
import { compact, money, whole } from '@/lib/format';

type Series = {
  key: string;
  label: string;
  bar: string;
  dot: string;
  chip: string;
  value: (point: AdminDailyPoint) => number;
  show: (value: number) => string;
};

/**
 * The colours are the log console's: a merchant message is violet here and violet
 * in the event rows, so the two surfaces read as the same thing. Tailwind needs
 * every class name written out, so the families are spelled in full.
 */
const SERIES: Series[] = [
  { key: 'visits', label: 'Visits', bar: 'bg-sky-500', dot: 'bg-sky-500', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', value: (p) => p.visits, show: whole },
  { key: 'messages', label: 'Messages', bar: 'bg-violet-500', dot: 'bg-violet-500', chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300', value: (p) => p.messagesIn + p.messagesOut, show: whole },
  { key: 'conversations', label: 'Conversations', bar: 'bg-fuchsia-500', dot: 'bg-fuchsia-500', chip: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300', value: (p) => p.conversations, show: whole },
  { key: 'orders', label: 'Orders', bar: 'bg-emerald-500', dot: 'bg-emerald-500', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', value: (p) => p.orders, show: whole },
  { key: 'revenue', label: 'Revenue', bar: 'bg-teal-500', dot: 'bg-teal-500', chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300', value: (p) => p.revenue, show: money },
  { key: 'tokens', label: 'LLM tokens', bar: 'bg-amber-500', dot: 'bg-amber-500', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', value: (p) => p.tokens, show: compact },
];

/** One metric at a time: ninety thin bars in two colours are unreadable, ninety in one are not. */
export function AdminDailyChart({
  daily,
  hint,
}: {
  daily: AdminDailyPoint[];
  hint?: string;
}) {
  const [key, setKey] = useState(SERIES[0].key);
  const series = SERIES.find((entry) => entry.key === key) ?? SERIES[0];

  const values = daily.map(series.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.indexOf(Math.max(...values));
  const max = values[peakIndex] ?? 0;
  // Labels have to survive 365 days of them: every nth, always including the last day.
  const step = Math.max(1, Math.ceil(daily.length / 10));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((entry) => {
            const on = entry.key === series.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setKey(entry.key)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? entry.chip
                    : 'border-border/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${on ? entry.dot : 'bg-muted-foreground/40'}`} />
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {total > 0 && peakIndex >= 0 && max > 0 ? (
            <>
              total <strong className="font-semibold text-foreground">{series.show(total)}</strong> · peak{' '}
              {series.show(max)} on {daily[peakIndex].date}
            </>
          ) : (
            'nothing on this metric yet'
          )}
        </p>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div
          className="flex h-48 items-end gap-1"
          style={daily.length > 40 ? { minWidth: `${daily.length * 12}px` } : undefined}
        >
          {daily.map((point, index) => {
            const value = series.value(point);
            const percent = max > 0 && value > 0 ? Math.max(3, (value / max) * 100) : 0;
            return (
              <div key={point.date} className="group relative flex h-full flex-1 items-end">
                <div
                  style={{ height: `${percent}%` }}
                  className={`w-full rounded-t-sm transition-all duration-200 group-hover:opacity-100 ${
                    value > 0 ? `${series.bar} opacity-70` : 'bg-transparent'
                  }`}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max -translate-x-1/2 rounded-lg border border-border bg-card p-2.5 text-[11px] shadow-xl group-hover:block">
                  <p className="font-semibold text-foreground">{point.date}</p>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    {SERIES.map((entry) => {
                      const shown = entry.value(point);
                      if (shown <= 0) return null;
                      return (
                        <p key={entry.key} className={entry.key === series.key ? 'text-foreground' : undefined}>
                          {entry.label}: <strong>{entry.show(shown)}</strong>
                        </p>
                      );
                    })}
                    {total === 0 && <p>nothing recorded</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="mt-2 flex gap-1"
          style={daily.length > 40 ? { minWidth: `${daily.length * 12}px` } : undefined}
        >
          {daily.map((point, index) => (
            <span
              key={point.date}
              className={`flex-1 truncate text-center font-mono text-[10px] text-muted-foreground ${
                index === peakIndex ? 'text-foreground' : ''
              }`}
            >
              {index % step === 0 || index === daily.length - 1 ? point.date.slice(5) : ''}
            </span>
          ))}
        </div>
      </div>

      {total === 0 && hint ? (
        <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
