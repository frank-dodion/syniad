import { auth } from './auth';
import { NextRequest } from 'next/server';

/**
 * CRITICAL REQUIREMENT: User ID must always be Cognito `sub` (from ID token)
 * Never use Better Auth's internal session.user.id
 * See docs/AUTH-REQUIREMENTS.md for details
 */

export interface UserIdentity {
  userId?: string; // MUST be Cognito `sub` - never Better Auth's internal ID
  username?: string;
  email?: string;
}

/**
 * Extract user identity from Better Auth session or Bearer token
 * Returns user identity or null if not authenticated
 * 
 * Supports two authentication methods:
 * 1. Better Auth session (cookies) - for same-origin requests
 * 2. Bearer token in Authorization header - for cross-origin requests (e.g., Swagger UI)
 */
export async function extractUserIdentity(request: NextRequest): Promise<UserIdentity | null> {
  // First, try to get bearer token from Authorization header (for cross-origin requests)
  const authHeader = request.headers.get('authorization');
  let idToken: string | null = null;
  
  console.log('[api-auth] Authorization header:', authHeader ? 'present' : 'missing');
  console.log('[api-auth] Request URL:', request.url);
  console.log('[api-auth] Request method:', request.method);
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Extract bearer token
    idToken = authHeader.substring(7).trim();
    console.log('[api-auth] Found bearer token in Authorization header, length:', idToken.length);
  } else if (authHeader) {
    console.error('[api-auth] Authorization header present but not Bearer format:', authHeader.substring(0, 20));
  }
  
  // Try Better Auth session (for same-origin requests with cookies)
  // If this fails, we'll try bearer token - but log the error to surface issues
  let session: any = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (sessionError) {
    // Log the error to surface session issues - don't silently ignore
    console.error('[api-auth] Session check failed:', sessionError);
    // Continue to try bearer token if available
  }
  
  // If we have a bearer token, use it (takes precedence for cross-origin requests)
  if (idToken) {
    console.log('[api-auth] Attempting to decode bearer token');
    const userId = await decodeCognitoUserId(idToken);
    if (!userId) {
      console.error('[api-auth] Failed to decode userId from bearer token. Token may be invalid or missing sub claim.');
      return null;
    }
    
    console.log('[api-auth] Successfully decoded userId from bearer token:', userId);
    // Extract user info from token payload - fail if we can't decode
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      console.error('[api-auth] Bearer token has invalid format (not a JWT). Expected 3 parts separated by dots.');
      return null;
    }
    
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    } catch (e) {
      console.error('[api-auth] Failed to decode bearer token payload. Token may be corrupted.', e);
      return null;
    }
    
    return {
      userId: userId,
      username: payload.name || payload.email || payload['cognito:username'] || undefined,
      email: payload.email || undefined
    };
  }
  
  // Use Better Auth session if no bearer token
  if (session && session.user) {
    console.log('[api-auth] Using Better Auth session');
    // Extract userId from session
    // Better Auth stores Cognito tokens in session.idToken (from callbacks)
    // We MUST decode the ID token to get the 'sub' (Cognito user ID)
    // Never fall back to session.user.id as it's Better Auth's internal ID, not the immutable Cognito sub
    let userId: string | null = null;
    
    // Try to get ID token from session
    const sessionIdToken = (session as any).idToken;
    if (sessionIdToken) {
      userId = await decodeCognitoUserId(sessionIdToken);
    }
    
    // CRITICAL: Do NOT fall back to session.user.id
    // We MUST use the Cognito 'sub' claim for consistency and immutability
    // If we can't get it, return null to force re-authentication
    if (!userId) {
      console.error('[api-auth] Failed to extract Cognito sub from ID token. ID token may not be stored in session. User must re-authenticate.');
      return null;
    }
    
    return {
      userId: userId,
      username: session.user.name || session.user.email || undefined,
      email: session.user.email || undefined
    };
  }
  
  console.log('[api-auth] No authentication found - returning null');
  return null;
}

/**
 * Decode Cognito ID token to extract 'sub' (user ID)
 * Throws error if token is invalid or missing sub claim - no fallbacks to mask issues
 */
async function decodeCognitoUserId(idToken: string | undefined): Promise<string | null> {
  if (!idToken) {
    return null;
  }
  
  // JWT tokens have 3 parts separated by dots: header.payload.signature
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    console.error('[decodeCognitoUserId] Invalid JWT format. Expected 3 parts separated by dots, got:', parts.length);
    return null;
  }
  
  // Decode the payload (second part) - fail if we can't decode
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch (error) {
    console.error('[decodeCognitoUserId] Failed to decode JWT payload. Token may be corrupted.', error);
    return null;
  }
  
  // CRITICAL: sub claim is required - fail if missing
  if (!payload.sub) {
    console.error('[decodeCognitoUserId] ID token missing required "sub" claim. Token:', {
      hasPayload: !!payload,
      payloadKeys: Object.keys(payload || {}),
      tokenPreview: idToken.substring(0, 50) + '...'
    });
    return null;
  }
  
  return payload.sub;
}

/**
 * Create a standardized API response
 */
export function createApiResponse(
  statusCode: number,
  data: any,
  user?: UserIdentity | null
): Response {
  const body = user ? { ...data, user } : data;
  
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

