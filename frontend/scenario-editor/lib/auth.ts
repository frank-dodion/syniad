import { betterAuth } from "better-auth";
import { toNextJsHandler } from "better-auth/next-js";

// Cognito configuration
const cognitoRegion = process.env.COGNITO_REGION || 'us-east-1';
const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
const cognitoDomain = process.env.COGNITO_DOMAIN || '';
const cognitoClientId = process.env.COGNITO_CLIENT_ID || '';

// Better Auth Cognito configuration
// Better Auth expects the full domain format: domain.auth.region.amazoncognito.com
// If we only have the domain name, construct the full domain
let cognitoDomainFull = cognitoDomain;
if (cognitoDomain && !cognitoDomain.includes('amazoncognito.com')) {
  // If it's just the domain name, construct the full domain
  cognitoDomainFull = `${cognitoDomain}.auth.${cognitoRegion}.amazoncognito.com`;
} else if (cognitoDomain.includes('https://')) {
  // If it's a full URL, extract just the domain part
  const match = cognitoDomain.match(/https?:\/\/([^\/]+)/);
  if (match) {
    cognitoDomainFull = match[1];
  }
}

// Construct the callback URL that Better Auth will use
const baseURL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
const callbackURL = `${baseURL}/api/auth/callback/cognito`;

// Only configure Cognito if all required values are present
// Better Auth expects: domain (full format: domain.auth.region.amazoncognito.com), region, userPoolId, clientId
const cognitoConfig = (userPoolId && cognitoDomainFull && cognitoClientId) ? {
  cognito: {
    clientId: cognitoClientId,
    clientSecret: process.env.COGNITO_CLIENT_SECRET || 'dummy-secret-for-public-client',
    domain: cognitoDomainFull, // Full domain: e.g., "syniad-dev-auth-dev.auth.us-east-1.amazoncognito.com"
    region: cognitoRegion, // e.g., "us-east-1"
    userPoolId: userPoolId,
    scope: ["email", "openid", "profile"],
    // Explicitly set the callback URL to ensure it matches Cognito configuration
    callbackURL: callbackURL,
  },
} : {};

export const auth = betterAuth({
  baseURL: baseURL,
  basePath: "/api/auth",
  trustedOrigins: [
    "http://localhost:3000",
    "https://editor.dev.syniad.net",
    "https://dev.syniad.net",
  ],
  // No database adapter - using JWT sessions only
  emailAndPassword: {
    enabled: false, // Using Cognito OAuth only
  },
  socialProviders: cognitoConfig,
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // 1 hour
    strategy: "jwt", // Use JWT sessions (no database needed)
  },
});

export const { GET, POST } = toNextJsHandler(auth);

