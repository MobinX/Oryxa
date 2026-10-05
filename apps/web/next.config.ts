/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ['dev.oryxa.us', 'dev-api.oryxa.us'],
  transpilePackages: [],
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
};

export default nextConfig;
