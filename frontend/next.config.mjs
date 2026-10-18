/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` and `next start` can run side by side when NEXT_DIST_DIR differs (e.g. .next-dev)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  // runs src/instrumentation.ts at server start (needed on Next 14; stable from Next 15)
  experimental: { instrumentationHook: true },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
