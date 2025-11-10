import { betterAuth } from "better-auth";
import { logger as betterAuthLogger } from "@better-auth/core/env";

const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (
    args.length > 0 &&
    typeof args[0] === "string" &&
    args[0].includes(
      "Better Auth]: No database configuration provided. Using memory adapter in development"
    )
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

const originalBetterAuthWarn = betterAuthLogger.warn.bind(betterAuthLogger);
betterAuthLogger.warn = (...args: Parameters<typeof betterAuthLogger.warn>) => {
  if (
    args.length > 0 &&
    typeof args[0] === "string" &&
    args[0].includes(
      "No database configuration provided. Using memory adapter in development"
    )
  ) {
    return;
  }
  originalBetterAuthWarn(...args);
};

// Cognito configuration - following Better Auth documentation exactly
// These are read at runtime, not build time, so they may be empty during build
const cognitoClientId = process.env.COGNITO_CLIENT_ID || '';
const cognitoClientSecret = process.env.COGNITO_CLIENT_SECRET || '';
const cognitoDomain = process.env.COGNITO_DOMAIN || ''; // Full domain: e.g., "your-app.auth.us-east-1.amazoncognito.com"
const cognitoRegion = process.env.COGNITO_REGION || 'us-east-1';
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || '';

// Base URL for Better Auth - use runtime environment variable
// Can be set at Lambda runtime, no need for build-time embedding
const baseURL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

// Helper to validate Cognito config only at runtime (not during build)
function validateCognitoConfig() {
  if (!cognitoClientId || !cognitoDomain || !cognitoUserPoolId) {
    // Only throw if we're actually trying to use auth (runtime), not during build
    // During build, Next.js may evaluate modules without env vars
    if (process.env.NODE_ENV !== 'production' || typeof window !== 'undefined') {
      // In development or client-side, we can be more lenient
      return;
    }
    // In production server runtime, we need these
    throw new Error('Cognito configuration missing. Set COGNITO_CLIENT_ID, COGNITO_DOMAIN, and COGNITO_USER_POOL_ID environment variables.');
  }
}

// Better Auth requires a secret (for JWT signing)
const secret = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'change-this-secret-in-production-min-32-chars';

// Trusted origins - include baseURL and common local/production URLs
const trustedOrigins = [
  baseURL, // Always trust the configured base URL
  "http://localhost:3000", // Local development
  "https://dev.syniad.net", // Dev environment
  "https://syniad.net", // Production
];

// Configure Better Auth with Cognito - following documentation exactly
// Only validate config at runtime, not during build
// During build, env vars may not be available, so we allow empty values
// Better Auth will validate when actually used (at runtime)
export const auth = betterAuth({
  baseURL: baseURL,
  basePath: "/api/auth",
  secret: secret, // Required by Better Auth
  trustedOrigins: trustedOrigins,
  emailAndPassword: {
    enabled: false, // Using Cognito OAuth only
  },
  socialProviders: {
    cognito: cognitoClientId && cognitoDomain && cognitoUserPoolId ? {
      clientId: cognitoClientId,
      // Better Auth may require clientSecret field even for public clients
      // Pass empty string for public clients (no secret generated)
      clientSecret: cognitoClientSecret || '',
      domain: cognitoDomain, // Full domain format: "your-app.auth.us-east-1.amazoncognito.com"
      region: cognitoRegion, // e.g., "us-east-1"
      userPoolId: cognitoUserPoolId,
    } : undefined, // Only configure if all required values are present
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // 1 hour
    // JWT sessions are used by default when no database is configured
  },
  // Advanced configuration
  advanced: {
    cookiePrefix: "better-auth",
    // generateId: undefined, // Use default ID generation
  },
  callbacks: {
    async jwt({ token, account }: { token: any; account?: any }) {
      // Store Cognito tokens in JWT token during initial OAuth callback
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
      }
      // Preserve existing tokens if account is not present (session refresh)
      // The tokens should already be in the token from the initial callback
      return token;
    },
    async session({ session, token }: { session: any; token?: any }) {
      // Include Cognito tokens in session for API authentication
      // Always try to get tokens from token (which persists in JWT)
      if (token) {
        (session as any).accessToken = token.accessToken;
        (session as any).idToken = token.idToken;
        (session as any).refreshToken = token.refreshToken;
      }
      return session;
    },
  },
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  },
});

// Auth instance is exported for use in route handlers and server components
