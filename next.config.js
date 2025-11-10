const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (
    args.length > 0 &&
    typeof args[0] === 'string' &&
    args[0].includes('Better Auth]: No database configuration provided. Using memory adapter in development')
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // basePath and assetPrefix can be set at build time if needed
  // For environment-agnostic builds, leave empty - CloudFront handles routing
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
  // Remove env section - these would be embedded at build time
  // Client-side code now uses window.location.origin at runtime
  // Server-side code reads from runtime environment variables
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

