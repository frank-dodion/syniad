import { auth } from './auth';
import { NextRequest } from 'next/server';

export interface UserIdentity {
  userId?: string;
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
  try {
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
      console.log('[api-auth] Authorization header present but not Bearer format:', authHeader.substring(0, 20));
    }
    
    // Try Better Auth session (for same-origin requests with cookies)
    let session: any = null;
    try {
      session = await auth.api.getSession({ headers: request.headers });
    } catch (sessionError) {
      // Session check failed, but we might have a bearer token
      console.log('[api-auth] Session check failed, will try bearer token');
    }
    
    // If we have a bearer token, use it (takes precedence for cross-origin requests)
    if (idToken) {
      console.log('[api-auth] Attempting to decode bearer token');
      const userId = await decodeCognitoUserId(idToken);
      if (userId) {
        console.log('[api-auth] Successfully decoded userId from bearer token:', userId);
        // Try to get user info from token payload
        try {
          const parts = idToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return {
              userId: userId,
              username: payload.name || payload.email || payload['cognito:username'] || undefined,
              email: payload.email || undefined
            };
          }
        } catch (e) {
          console.log('[api-auth] Could not decode token payload, using userId only');
          // If we can't decode, just return userId
        }
        
        return {
          userId: userId,
          username: undefined,
          email: undefined
        };
      } else {
        console.log('[api-auth] Failed to decode userId from bearer token');
      }
    }
    
    // Fallback to Better Auth session if no bearer token or bearer token decode failed
    if (session && session.user) {
      console.log('[api-auth] Using Better Auth session');
      // Extract userId from session
      // Better Auth stores Cognito tokens in session.idToken (from callbacks)
      // We need to decode the ID token to get the 'sub' (Cognito user ID)
      let userId: string | null = null;
      
      // Try to get ID token from session
      const sessionIdToken = (session as any).idToken;
      if (sessionIdToken) {
        userId = await decodeCognitoUserId(sessionIdToken);
      }
      
      // Fallback to session.user.id if ID token decode fails
      if (!userId) {
        userId = session.user.id || null;
      }
      
      return {
        userId: userId || undefined,
        username: session.user.name || session.user.email || undefined,
        email: session.user.email || undefined
      };
    }
    
    console.log('[api-auth] No authentication found - returning null');
    return null;
  } catch (error) {
    console.error('Error extracting user identity:', error);
    return null;
  }
}

/**
 * Decode Cognito ID token to extract 'sub' (user ID)
 */
async function decodeCognitoUserId(idToken: string | undefined): Promise<string | null> {
  if (!idToken) {
    return null;
  }
  
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode the payload (second part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Return the 'sub' claim which is the Cognito user ID
    return payload.sub || null;
  } catch (error) {
    console.error('Error decoding ID token:', error);
    return null;
  }
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

