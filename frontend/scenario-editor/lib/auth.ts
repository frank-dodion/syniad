import { betterAuth } from "better-auth";

// Cognito configuration - following Better Auth documentation exactly
const cognitoClientId = process.env.COGNITO_CLIENT_ID || '';
const cognitoClientSecret = process.env.COGNITO_CLIENT_SECRET || '';
const cognitoDomain = process.env.COGNITO_DOMAIN || ''; // Full domain: e.g., "your-app.auth.us-east-1.amazoncognito.com"
const cognitoRegion = process.env.COGNITO_REGION || 'us-east-1';
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || '';

// Base URL for Better Auth
const baseURL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

// Better Auth requires a secret (for JWT signing)
const secret = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'change-this-secret-in-production-min-32-chars';

// Configure Better Auth with Cognito - following documentation exactly
export const auth = betterAuth({
  baseURL: baseURL,
  basePath: "/api/auth",
  secret: secret, // Required by Better Auth
  trustedOrigins: [
    "http://localhost:3000",
    "https://editor.dev.syniad.net",
    "https://dev.syniad.net",
  ],
  emailAndPassword: {
    enabled: false, // Using Cognito OAuth only
  },
  socialProviders: {
    cognito: {
      clientId: cognitoClientId,
      // Better Auth may require clientSecret field even for public clients
      // Pass empty string for public clients (no secret generated)
      clientSecret: cognitoClientSecret || '',
      domain: cognitoDomain, // Full domain format: "your-app.auth.us-east-1.amazoncognito.com"
      region: cognitoRegion, // e.g., "us-east-1"
      userPoolId: cognitoUserPoolId,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // 1 hour
    // JWT sessions are used by default when no database is configured
  },
  advanced: {
    generateIdToken: false, // Don't generate our own ID token, use Cognito's
  },
  callbacks: {
    async jwt({ token, account }) {
      // Store Cognito tokens in JWT token
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Include Cognito tokens in session for API authentication
      if (token) {
        (session as any).accessToken = token.accessToken;
        (session as any).idToken = token.idToken;
        (session as any).refreshToken = token.refreshToken;
      }
      return session;
    },
  },
});

// Auth instance is exported for use in route handlers and server components
