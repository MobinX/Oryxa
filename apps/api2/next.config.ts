import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiSrc = path.join(root, 'apps/api/src');

const monorepoAliases: Record<string, string> = {
  '@api': apiSrc,
  '@db': path.join(root, 'packages/db'),
  '@shared': path.join(root, 'packages/shared'),
  '@agent': path.join(root, 'packages/agent'),
};

const nextConfig: NextConfig = {
  transpilePackages: [
    '@repo/api',
    '@repo/db',
    '@repo/shared',
    '@repo/agent',
    '@repo/integrations',
    '@repo/utils',
  ],
  serverExternalPackages: ['firebase-admin', '@neondatabase/serverless', 'postgres', 'ffmpeg-static'],
  // The transcoder binary is not JavaScript, so the tracer has to be told about it explicitly —
  // without this the voice path works until it asks ffmpeg for a file that was never shipped.
  outputFileTracingIncludes: {
    '/api/[[...route]]': ['../../node_modules/ffmpeg-static/ffmpeg'],
  },
  typescript: {
    // Typecheck runs across workspace-linked `api` sources (path aliases, duplicate hono typings).
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, ...monorepoAliases };
    return config;
  },
  turbopack: {
    resolveAlias: monorepoAliases,
  },
};

export default nextConfig;
