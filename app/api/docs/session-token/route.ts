import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

// GET /api/docs/session-token - Get the current user's ID token for Swagger UI
// This allows Swagger docs to automatically authenticate using the user's session
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return new Response(JSON.stringify({ 
        token: null,
        authenticated: false 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // Extract ID token from session
    const idToken = (session as any).idToken || null;
    
    return new Response(JSON.stringify({ 
      token: idToken,
      authenticated: !!idToken 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Error getting session token:', error);
    return new Response(JSON.stringify({ 
      token: null,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200, // Return 200 even on error so Swagger UI can still load
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

