import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@campusgrid/shared'],
  // Linting runs from the repo root (pnpm lint), not during next build.
  eslint: { ignoreDuringBuilds: true },
  // Same-origin /api so the httpOnly cg_token cookie works without CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
