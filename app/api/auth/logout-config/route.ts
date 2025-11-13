import { NextRequest } from 'next/server';

// GET /api/auth/logout-config - Get Cognito logout configuration
// This allows client-side code to construct the Cognito logout URL
export async function GET(request: NextRequest) {
  const cognitoDomain = process.env.COGNITO_DOMAIN || '';
  const cognitoClientId = process.env.COGNITO_CLIENT_ID || '';
  
  // Get the frontend URL for the logout redirect
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
  
  if (!cognitoDomain || !cognitoClientId) {
    return new Response(JSON.stringify({ 
      error: 'Cognito configuration missing',
      logoutUrl: null
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
  
  // Construct Cognito logout URL
  // Format: https://{domain}/logout?client_id={clientId}&logout_uri={logoutUri}
  const logoutUrl = `https://${cognitoDomain}/logout?client_id=${encodeURIComponent(cognitoClientId)}&logout_uri=${encodeURIComponent(frontendUrl)}`;
  
  return new Response(JSON.stringify({ 
    logoutUrl,
    cognitoDomain,
    frontendUrl
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    }
  });
}

