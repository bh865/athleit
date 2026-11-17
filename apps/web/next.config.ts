import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iOS requires apple-app-site-association to be served as JSON with no extension.
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
  // Workspace packages ship TypeScript/CSS source (no build step), so Next must compile them.
  transpilePackages: ['@athleit/core', '@athleit/db', '@athleit/tokens', '@athleit/ui-core'],
};

export default nextConfig;
