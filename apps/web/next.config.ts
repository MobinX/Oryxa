/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ['dev.oryxa.us', 'dev-api.oryxa.us'],
  /**
   * `COMPANY_NAME` and `PARENT_COMPANY_NAME` are the names the UI prints (see lib/brand.ts) and
   * `'use client'` pages print them too. Without this line a non-`NEXT_PUBLIC_` variable is
   * server-only, and the sidebar, the login card and the legal footers would render an empty
   * brand in the browser. Listing them here inlines the values into both bundles at build time,
   * so one env name serves both sides.
   */
  env: {
    COMPANY_NAME: process.env.COMPANY_NAME,
    PARENT_COMPANY_NAME: process.env.PARENT_COMPANY_NAME,
  },
  transpilePackages: ['@repo/utils'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    useCache: true,
    cacheComponents: true,
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      // Variant images can be up to 4MB each (API limit), and a product form
      // may include several variant rows in one submit. The default 1MB would
      // reject most real images before the action runs.
      bodySizeLimit: '20mb',
    },
  },
  /**
   * `/logs` moved to `/admin/logs`. A page cannot do the forwarding here: under
   * `cacheComponents` the old path is prerendered, and a prerendered `redirect()`
   * reaches the browser as a 200 shell rather than a redirect — while opting out of
   * the cache with the `dynamic` segment config is a build error under
   * `cacheComponents`. The router does it instead, and carries the query string over
   * for free, which is what a filtered bookmark from an Axiom alert needs.
   * 307 rather than 308: a moved console should not be pinned in browser caches
   * across the next move.
   */
  /**
   * Baseline security headers on every response. No restrictive `script-src`
   * or `connect-src`: Firebase Google popup login, reCAPTCHA and Next's inline
   * bootstrap scripts all need non-self sources, and this app cannot afford to
   * break them — so those two directives are simply left unmanaged.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
              "form-action 'self' https://*.firebaseapp.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/logs', destination: '/admin/logs', permanent: false },
      { source: '/logs/login', destination: '/admin/login', permanent: false },
    ];
  },
  /**
   * The console's data calls go to this app's own origin and are forwarded here, because
   * `NEXT_PUBLIC_API_URL` is a machine-local address in the browser bundle: on a phone or through
   * a tunnel, `http://localhost:3500` is the device itself, so every direct browser-to-API call
   * dies at the network and the page paints an empty pane. The server resolves that host fine, so
   * proxying it restores what a reload — which is server-rendered — was already doing. The API host
   * does not have to be public or same-origin: only this server ever contacts it.
   * `afterFiles` rather than the default: the real route handlers under `/api/v1` (the Facebook
   * callback) have to be matched before the proxy swallows the prefix. Both prefixes the console
   * calls — `/api/v1` for a store, `/api2` for the operator pages — go through, or one of them
   * would be left asking the browser to reach the API after all.
   */
  async rewrites() {
    const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
    const api = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    return {
      afterFiles: [
        { source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` },
        { source: '/api2/:path*', destination: `${api}/api2/:path*` },
      ],
    };
  },
};

export default nextConfig;
