import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

// GET /api/docs/session-token - Get the current user's ID token for Swagger UI
// This allows Swagger docs to automatically authenticate using the user's session
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    // Log the FULL session structure to see what's actually in the cookie
    console.log('[session-token] Full session object:', JSON.stringify(session, null, 2));
    
    if (!session || !session.user) {
      return new Response(JSON.stringify({ 
        token: null,
        authenticated: false 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate, private',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // First, check if ID token is directly in the session object
    // Better Auth might store it at the top level or nested
    const directIdToken = (session as any).idToken 
      || (session as any).session?.idToken
      || (session as any).token?.idToken
      || (session as any).account?.idToken
      || (session as any).accounts?.[0]?.idToken
      || null;
    
    if (directIdToken) {
      console.log('[session-token] Found ID token directly in session');
      return new Response(JSON.stringify({ 
        token: directIdToken,
        authenticated: true 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate, private',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // Try to get ID token from Better Auth's account API
    // Better Auth stores OAuth tokens in the account table
    // According to Better Auth OAuth docs: https://www.better-auth.com/docs/concepts/oauth
    // getAccessToken can retrieve tokens for a provider
    try {
      const tokenResponse = await auth.api.getAccessToken({
        body: {
          providerId: "cognito",
          // accountId is optional - if not provided, returns token for user's account with this provider
        },
        headers: request.headers,
      });
      
      console.log('[session-token] getAccessToken response:', JSON.stringify(tokenResponse, null, 2));
      
      // Check if ID token is in the response
      const idToken = (tokenResponse as any)?.idToken 
        || (tokenResponse as any)?.data?.idToken
        || null;
      
      if (idToken) {
        return new Response(JSON.stringify({ 
          token: idToken,
          authenticated: true 
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    } catch (tokenError) {
      console.error('[session-token] Error getting access token from Better Auth:', tokenError);
      // Fall through to return null
    }
    
    // If we can't get token from Better Auth API, return null
    return new Response(JSON.stringify({ 
      token: null,
      authenticated: false 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('[session-token] Error getting session token:', error);
    return new Response(JSON.stringify({ 
      token: null,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200, // Return 200 even on error so Swagger UI can still load
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

