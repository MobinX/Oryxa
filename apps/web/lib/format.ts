/** Numbers the way an operator reads them: grouped, signed, and never a raw float. */

export function whole(value: number): string {
  return value.toLocaleString('en-US');
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return whole(value);
}

export function money(value: number): string {
  return `$${value.toFixed(value >= 1_000 ? 0 : 2)}`;
}

export type Delta = { text: string; tone: 'up' | 'down' | 'flat' };

/**
 * The change against the window of the same length immediately before, which is the
 * only comparison the API can answer honestly — both sides cover exactly the same
 * number of days. `null` when there is nothing to say: a flat zero is not a trend.
 */
export function deltaOf(current: number, previous: number): Delta | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { text: 'new', tone: 'up' };
  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < 0.5) return { text: 'flat', tone: 'flat' };
  const rounded = Math.abs(percent) >= 100 ? Math.round(percent) : Math.round(percent * 10) / 10;
  return {
    text: `${percent > 0 ? '↑' : '↓'}${Math.abs(rounded)}%`,
    tone: percent > 0 ? 'up' : 'down',
  };
}
