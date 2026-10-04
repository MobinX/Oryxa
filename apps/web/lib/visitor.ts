/**
 * The browser's anonymous visit id.
 *
 * It exists so "how many people opened this store today" can be answered without
 * identifying anyone: the value is a random uuid kept in a first-party cookie, it is
 * sent only to our own API, and the API stores a hash of it over one store and one
 * UTC day — never this string. A shopper who clears cookies, or who browses with
 * storage blocked, simply reports no id and counts inside the shared anonymous bucket.
 */

const COOKIE_NAME = 'oryxa_vid';
const MAX_AGE_DAYS = 30;

/** Anything we mint: a uuid, or the fallback for a browser without `randomUUID`. */
const ID_SHAPE = /^[0-9a-z_-]{8,64}$/i;

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

function mint(): string {
  // `randomUUID` is missing outside a secure context, so the fallback keeps the same
  // shape: it is stored and re-read, and only ever hashed server-side.
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  const noise = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${noise}`;
}

export function visitorId(): string {
  let stored = '';
  try {
    stored = readCookie(COOKIE_NAME);
  } catch {
    // A document with no cookie access at all still gets an id for this page view.
  }
  if (ID_SHAPE.test(stored)) return stored;

  const id = mint();
  try {
    document.cookie = `${COOKIE_NAME}=${id}; path=/; max-age=${MAX_AGE_DAYS * 86_400}; samesite=lax`;
  } catch {
    // Setting it is best-effort; a read-only document reports the same id this once.
  }
  return id;
}
