import { describe, it, expect } from 'vitest';
import nextConfig from '../../apps/web/next.config';

/**
 * Structural types mirroring the relevant slice of the Next.js config shape
 * (see next/dist/lib/load-custom-routes.d.ts) so this test does not have to
 * import 'next', which is not resolvable from the root typecheck scope.
 */
interface ResponseHeader {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: ResponseHeader[];
}

type HeaderFn = () => Promise<HeaderRule[]>;

/** Returns the headers for the `/:path*` catch-all route. */
async function pathStarHeaders(): Promise<ResponseHeader[]> {
  const headersFn = nextConfig.headers as unknown as HeaderFn | undefined;
  if (!headersFn) return [];
  const rules = await headersFn();
  const rule = rules.find((r): boolean => r.source === '/:path*');
  return rule?.headers ?? [];
}

describe('web Next.js config (apps/web/next.config.ts) - F2 security hardening', () => {
  it('sets poweredByHeader: false to prevent framework disclosure', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('sets productionBrowserSourceMaps: false to prevent source map leakage', () => {
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
  });

  it('includes X-Frame-Options DENY on the catch-all route', async () => {
    const headers = await pathStarHeaders();
    const frameOptions = headers.find((h): boolean => h.key === 'X-Frame-Options');
    expect(frameOptions?.value).toBe('DENY');
  });

  it('headers() does not expose Access-Control-Allow-Origin', async () => {
    const headers = await pathStarHeaders();
    const acog = headers.find(
      (h): boolean => h.key.toLowerCase() === 'access-control-allow-origin',
    );
    expect(acog).toBeUndefined();
  });

  it('includes other security headers (nosniff, referrer, permissions, CSP)', async () => {
    const headers = await pathStarHeaders();
    const get = (key: string): string | undefined =>
      headers.find((h): boolean => h.key === key)?.value;

    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get('Permissions-Policy')).toContain('geolocation=()');
    expect(get('Content-Security-Policy')).toContain('frame-ancestors \'none\'');
  });
});
