import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth.handler);

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  console.log('[Better Auth] GET request:', pathname);
  console.log('[Better Auth] Full URL:', request.nextUrl.toString());
  console.log('[Better Auth] Query params:', Object.fromEntries(request.nextUrl.searchParams));
  
  // Special handling for OAuth callback to inspect what Better Auth receives
  if (pathname.includes('/callback/cognito')) {
    console.log('[Better Auth] OAuth callback detected - checking for tokens in query params');
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    console.log('[Better Auth] Callback params:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      error: error
    });
  }
  
  try {
    const response = await handler.GET(request);
    console.log('[Better Auth] GET response status:', response.status);
    if (response.headers.get('location')) {
      console.log('[Better Auth] Redirect location:', response.headers.get('location'));
    }
    
    // For OAuth callback, try to extract tokens from response cookies
    // Better Auth stores session in cookies - we need to check if tokens are in the session
    if (pathname.includes('/callback/cognito') && response.status === 302) {
      // After successful OAuth callback, Better Auth creates a session
      // Check if we can get the session and see what's stored
      const setCookieHeaders = response.headers.getSetCookie();
      console.log('[Better Auth] Callback Set-Cookie headers:', setCookieHeaders.length);
      
      // Try to get session after callback to see if tokens are available
      // Note: This won't work here because the session is set in the response
      // We'll need to check the session on the next request
    }
    
    // For callback, log more details
    if (pathname.includes('/callback/cognito')) {
      const clonedResponse = response.clone();
      clonedResponse.text().then(body => {
        console.log('[Better Auth] Callback response body (first 1000 chars):', body.substring(0, 1000));
      }).catch(() => {});
    }
    
    // Log error responses
    if (response.status >= 400) {
      const clonedResponse = response.clone();
      clonedResponse.text().then(body => {
        console.error('[Better Auth] Error response body:', body.substring(0, 1000));
      }).catch(() => {});
    }
    return response;
  } catch (error) {
    console.error('[Better Auth] GET handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: NextRequest) {
  console.log('[Better Auth] POST request:', request.nextUrl.pathname);
  console.log('[Better Auth] Full URL:', request.nextUrl.toString());
  try {
    const response = await handler.POST(request);
    console.log('[Better Auth] POST response status:', response.status);
    if (response.headers.get('location')) {
      console.log('[Better Auth] Redirect location:', response.headers.get('location'));
    }
    // Clone response to read body without consuming it
    const clonedResponse = response.clone();
    if (response.status === 200 || response.status === 302) {
      clonedResponse.text().then(body => {
        console.log('[Better Auth] Response body (first 500 chars):', body.substring(0, 500));
        // Check for redirect URLs in the body
        const urlMatch = body.match(/https?:\/\/[^\s"']+/g);
        if (urlMatch) {
          console.log('[Better Auth] URLs found in response:', urlMatch);
        }
      }).catch(() => {});
    } else if (response.status >= 400) {
      // Log error responses
      clonedResponse.text().then(body => {
        console.error('[Better Auth] Error response body:', body.substring(0, 1000));
      }).catch(() => {});
    }
    return response;
  } catch (error) {
    console.error('[Better Auth] POST handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

