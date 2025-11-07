import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get session endpoint for API client
 * Returns the current session with Cognito tokens
 */
export async function GET(request: NextRequest) {
  try {
    // Better Auth server-side API to get session
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    return NextResponse.json({ data: session });
  } catch (error) {
    console.error('[Get Session] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}

