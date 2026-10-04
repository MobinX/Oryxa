/**
 * The reader's clock, not the server's. Event times are written in UTC and the log
 * route reads a zone-less bound as UTC, so every conversion happens here — on the
 * way out to the query and on the way back to the page — and the wire contract
 * never notices that a human is reading a different clock.
 */

const FALLBACK = 'UTC';

/** What the browser writes about its own clock; it is not a secret, so it is not httpOnly. */
export const TZ_COOKIE = 'oryxa_logs_tz';

/** A cookie holds browser-owned text; a zone the runtime cannot use must not throw mid-render. */
export function validZone(value: string | undefined): string {
  if (!value) return FALLBACK;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return FALLBACK;
  }
}

function wallParts(at: Date, zone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
}

/** How far the zone's wall clock sits ahead of the instant, in ms. */
function offsetOf(at: number, zone: string): number {
  const p = wallParts(new Date(at), zone);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - at;
}

const NAIVE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/;

/** `2026-10-04 21:31:07` — an instant as the reader counts it. */
export function clockInZone(iso: string, zone: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const p = wallParts(new Date(at), zone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * A `datetime-local` value the reader typed on their own clock, rewritten as the
 * UTC wall clock the route reads it as — the value was never an instant, so it is
 * built as if UTC and then shifted. Two passes settle one that straddles a DST step.
 */
export function zoneBoundToUtc(raw: string, zone: string): string {
  const naive = NAIVE.exec(raw.trim());
  if (!naive) return raw;
  const anchor = Date.parse(`${naive[1]}T${naive[2]}${naive[3] ?? ':00'}Z`);
  let instant = anchor - offsetOf(anchor, zone);
  instant = anchor - offsetOf(instant, zone);
  return new Date(instant).toISOString().slice(0, 19);
}

/** An instant as the `datetime-local` value it looks like on the reader's clock. */
export function zoneWallClock(iso: string, zone: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const p = wallParts(new Date(at), zone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** `UTC+5` — short enough to label an input with. */
export function offsetLabel(zone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((entry) => entry.type === 'timeZoneName')?.value;
  return part ? part.replace(/^GMT/, 'UTC') : zone;
}
