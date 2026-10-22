/**
 * Origins allowed to make credentialed cross-origin calls: WEB_URL plus CORS_ORIGINS
 * (comma-separated), and any localhost port outside production. Anything else gets no
 * Access-Control-Allow-Origin header, so a hostile page cannot read responses with the
 * user's credentials. Requests without an Origin (server-to-server, Meta webhooks) are unaffected.
 */
function normalize(url: string): string | null {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

export function allowedOrigin(origin: string | undefined | null): string | null {
  if (!origin) return null;
  const candidate = normalize(origin);
  if (!candidate) return null;
  const list = [process.env.WEB_URL ?? '', ...(process.env.CORS_ORIGINS ?? '').split(',')]
    .map((o) => (o.trim() ? normalize(o) : null))
    .filter((o): o is string => Boolean(o));
  if (list.includes(candidate)) return candidate;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(candidate)) {
    return candidate;
  }
  return null;
}
