/**
 * Where an OAuth flow may return to. These are the brand web domains plus the deployment's own
 * WEB_URL. The OAuth state is signed, but this allowlist keeps a stolen merchant token from
 * turning the callback into an open redirect.
 */
const BRAND_WEB_ORIGINS = new Set([
  'https://oryxa.rrcomputer.com.bd',
  'https://www.oryxa.rrcomputer.com.bd',
  'https://onlyorders.tech',
  'https://www.onlyorders.tech',
]);

export function safeReturnOrigin(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
      return undefined;
    }
    const webOrigin = process.env.WEB_URL ? new URL(process.env.WEB_URL).origin : undefined;
    if (BRAND_WEB_ORIGINS.has(url.origin) || url.origin === webOrigin) return url.origin;
  } catch {
    // A malformed hint is simply not used; the deployment default still works.
  }
  return undefined;
}
