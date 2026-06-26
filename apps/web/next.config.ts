/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
