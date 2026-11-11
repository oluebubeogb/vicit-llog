/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Avoid noisy production crashes from certain client-boundary edge cases
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-App-Version', value: '1.0.1-v15' }],
      },
      {
        source: '/((?!_next/static|_next/image|icon-|apple-touch|splash|sw\.js).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' }],
      },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
