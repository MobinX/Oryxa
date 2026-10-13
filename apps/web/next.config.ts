/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ['dev.oryxa.us', 'dev-api.oryxa.us'],
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
   * proxying it restores what a reload — which is server-rendered — was already doing.
   * `afterFiles` rather than the default: the real route handlers under `/api/v1` (the Facebook
   * callback) have to be matched before the proxy swallows the prefix.
   */
  async rewrites() {
    const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
    const api = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    return { afterFiles: [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }] };
  },
};

export default nextConfig;
