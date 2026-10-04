/**
 * IANA zone names are the only timezone input the console accepts, and both sides
 * have to agree on that: the web app renders a zone the browser claims, the API
 * buckets a zone the dashboard asks for. `Intl` is the validator because it is the
 * thing that will actually be used with the value — no list to keep in sync.
 */

export const UTC_ZONE = 'UTC';

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Anything unusable becomes UTC rather than an error: a zone is a display choice, not data. */
export function resolveTimeZone(zone: string | undefined): string {
  const trimmed = zone?.trim();
  return trimmed && isValidTimeZone(trimmed) ? trimmed : UTC_ZONE;
}
