/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Configure for CloudFront deployment
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://dev.api.syniad.net',
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://editor.dev.syniad.net',
  },
  // Optimize images if needed
  images: {
    unoptimized: true, // CloudFront will handle optimization
  },
}

module.exports = nextConfig

