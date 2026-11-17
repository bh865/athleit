import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript/CSS source (no build step), so Next must compile them.
  transpilePackages: ['@athleit/core', '@athleit/db', '@athleit/tokens'],
};

export default nextConfig;
