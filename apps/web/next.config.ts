/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  serverActions: {
    // Variant images can be up to 4MB each (API limit), and a product form
    // may include several variant rows in one submit. The default 1MB would
    // reject most real images before the action runs.
    bodySizeLimit: '20mb',
  },
};

export default nextConfig;
