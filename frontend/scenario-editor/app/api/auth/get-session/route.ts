import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get session endpoint for API client
 * Returns the current session with Cognito tokens
 */
export async function GET(request: NextRequest) {
  try {
    // Better Auth server-side API to get session
    // This reads the JWT from the cookie and decodes it
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    // Log full session structure for debugging (in all environments for Lambda debugging)
    console.log('[Get Session] Full session structure:', JSON.stringify({
      hasSession: !!session,
      sessionType: typeof session,
      sessionKeys: session ? Object.keys(session) : [],
      hasData: !!(session as any)?.data,
      dataKeys: (session as any)?.data ? Object.keys((session as any).data) : [],
      hasSessionInData: !!(session as any)?.data?.session,
      sessionKeysInData: (session as any)?.data?.session ? Object.keys((session as any).data.session) : [],
      hasIdToken: !!(session as any)?.session?.idToken || !!(session as any)?.data?.session?.idToken || !!(session as any)?.idToken,
      idTokenLocation: (session as any)?.session?.idToken ? 'session.idToken' : 
                       (session as any)?.data?.session?.idToken ? 'data.session.idToken' :
                       (session as any)?.idToken ? 'idToken' : 'not found',
    }));
    
    // Better Auth returns { session, user } or { data: { session, user } }
    // The session object should contain the Cognito tokens from our callbacks
    const sessionData = (session as any)?.data || session;
    const actualSession = sessionData?.session || sessionData;
    
    // Extract tokens from the session (they should be at the top level of the session object)
    const idToken = actualSession?.idToken || null;
    
    if (!idToken) {
      console.warn('[Get Session] No ID token found. Session keys:', actualSession ? Object.keys(actualSession) : []);
    }
    
    return NextResponse.json({ 
      data: {
        session: actualSession,
        user: sessionData?.user,
      }
    });
  } catch (error) {
    console.error('[Get Session] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

