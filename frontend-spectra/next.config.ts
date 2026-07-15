import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // See src/lib/vision/shims/mediapipe-pose-shim.ts for why.
      '@mediapipe/pose': './src/lib/vision/shims/mediapipe-pose-shim.ts',
    },
  },
};

export default nextConfig;
