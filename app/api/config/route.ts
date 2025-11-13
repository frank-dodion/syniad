import { NextRequest } from 'next/server';

// GET /api/config - Get runtime configuration (e.g., WebSocket URL)
export async function GET(request: NextRequest) {
  try {
    // Get WebSocket URL from runtime environment variable
    // This is set in Lambda environment variables by Terraform (not NEXT_PUBLIC_* to avoid build-time embedding)
    const websocketUrl = process.env.WEBSOCKET_URL || null;
    
    return new Response(JSON.stringify({ 
      websocketUrl
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      }
    });
  } catch (error) {
    console.error('Error getting config:', error);
    return new Response(JSON.stringify({ 
      websocketUrl: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200, // Return 200 even on error so frontend can handle gracefully
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

