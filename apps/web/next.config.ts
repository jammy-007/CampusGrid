import path from 'node:path';
import type { NextConfig } from 'next';

try {
  process.loadEnvFile?.(path.resolve(process.cwd(), '../../.env'));
} catch {
  // Ignore if root .env is absent
}

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@campusgrid/shared'],
  // Linting runs from the repo root (pnpm lint), not during next build.
  eslint: { ignoreDuringBuilds: true },
  // Avoid writing hundreds of MBs of persistent webpack .pack.gz cache files to disk.
  webpack(config, { dev }) {
    config.cache = dev ? { type: 'memory' } : false;
    return config;
  },
  // Same-origin /api so the httpOnly cg_token cookie works without CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
