import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iOS requires apple-app-site-association to be served as JSON with no extension.
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      // The internal admin portal is never indexed and never cached by browsers or proxies.
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/admin',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  // Workspace packages ship TypeScript/CSS source (no build step), so Next must compile them.
  transpilePackages: ['@athleit/core', '@athleit/db', '@athleit/tokens', '@athleit/ui-core'],
};

export default nextConfig;
