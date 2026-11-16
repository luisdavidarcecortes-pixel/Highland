/** @type {import('next').NextConfig} */

// The editorial panel can delete issues and members, so every response states
// plainly that the site may not be framed and may not sniff content types.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/**
 * Content Security Policy.
 *
 * The application ships no third-party script: the only external origin is
 * Supabase (images and the realtime channel). `script-src` keeps 'unsafe-inline'
 * because Next.js injects its own inline bootstrap scripts; everything else is
 * locked down (no framing, no plugins, no other origins).
 */
function contentSecurityPolicy(isDev) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/reader/**': ['./scripts/prepare-reader.mjs', './node_modules/pdfjs-dist/**', './node_modules/@napi-rs/**'],
  },
  outputFileTracingExcludes: {
    // The sample issues are 42 MB each and only exist for local demo mode.
    // They must not travel inside the serverless bundle, which has a size
    // limit; the reader reads them from the working copy, not from the bundle.
    '/api/reader/**': ['./public/demo/**', './node_modules/pdfjs-dist/**/*.map'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
    // The covers and article images live behind /api/media, which only serves
    // them to signed-in members; the image optimizer fetches without their
    // cookies, so the files are streamed as they are.
    unoptimized: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy(isDev) },
          ...securityHeaders,
        ],
      },
    ];
  },
  experimental: {
    workerThreads: false,
    cpus: 4,
  },
};

module.exports = nextConfig;
