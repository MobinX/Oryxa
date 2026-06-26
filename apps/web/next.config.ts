/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
