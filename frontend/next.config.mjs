const dev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy. The app loads nothing from other sites (fonts, images, scripts are local; the browser
 * only talks to this origin: Bitnob, OpenTimestamps and blockstream are called by the SERVER). Next.js App Router
 * emits inline bootstrap scripts, hence 'unsafe-inline' for scripts; `eval` is only needed by the dev server.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // verification links carry an unguessable id: never leak them to other sites through the Referer
  { key: 'Referrer-Policy', value: 'same-origin' },
  // geolocation is used by the field proof form (this origin only); nothing else is needed
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000' }, // ignored by browsers on plain http
];

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
      { source: '/:path*', headers: securityHeaders },
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
