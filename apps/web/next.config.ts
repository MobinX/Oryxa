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
};

export default nextConfig;
