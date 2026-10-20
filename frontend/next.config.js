/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Avoid noisy production crashes from certain client-boundary edge cases
  reactStrictMode: true,
  poweredByHeader: false,
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
