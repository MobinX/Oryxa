/** The month selector of the operator console: `YYYY-MM` keys, UTC windows. */

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A pasted or bookmarked `?month=` is accepted whenever it is a real month, and anything
 * else reads as this month: a stale link should show numbers, not an error page.
 */
export function readMonth(value: string | string[] | undefined, now = new Date()): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && MONTH_KEY.test(raw) ? raw : currentMonth(now);
}

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** `count` months ending with the current one, newest first — the pills of the selector. */
export function recentMonths(count = 4, now = new Date()): string[] {
  const [year, month] = currentMonth(now).split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    // `Date.UTC` normalises a month below 1, so walking back past January lands on the
    // previous December without any calendar arithmetic of our own.
    const at = new Date(Date.UTC(year, month - 1 - index, 1));
    return at.toISOString().slice(0, 7);
  });
}

/** "Oct 2026", read on the reader's clock but never shifted by it: the key is a month, not a day. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${year}-${month}-01T00:00:00Z`));
}
