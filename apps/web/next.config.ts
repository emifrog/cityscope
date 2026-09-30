import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the container image (infra/docker/web.Dockerfile).
  output: 'standalone',
  // Monorepo: trace workspace packages from the repository root (next build runs in apps/web).
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources.
  transpilePackages: [
    '@etare/api',
    '@etare/adapters',
    '@etare/application',
    '@etare/config',
    '@etare/contracts',
    '@etare/domain',
    '@etare/schemas',
    '@etare/ui',
  ],
  serverExternalPackages: ['pg'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
