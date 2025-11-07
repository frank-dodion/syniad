import { auth } from './auth';
import { NextRequest } from 'next/server';

export interface UserIdentity {
  userId?: string;
  username?: string;
  email?: string;
}

/**
 * Extract user identity from Better Auth session
 * Returns user identity or null if not authenticated
 */
export async function extractUserIdentity(request: NextRequest): Promise<UserIdentity | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return null;
    }
    
    // Extract userId from session
    // Better Auth stores Cognito tokens in session.idToken (from callbacks)
    // We need to decode the ID token to get the 'sub' (Cognito user ID)
    let userId: string | null = null;
    
    // Try to get ID token from session
    const idToken = (session as any).idToken;
    if (idToken) {
      userId = await decodeCognitoUserId(idToken);
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

