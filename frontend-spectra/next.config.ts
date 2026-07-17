import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next refuses to run a second dev server against the same build directory,
  // which would make `npm run test:e2e` fail whenever a normal dev server is
  // running. The e2e run sets NEXT_DIST_DIR so it gets its own.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
