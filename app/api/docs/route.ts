import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';

// GET /api/docs - Serve Swagger UI (requires authentication)
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      // Redirect to login - preserve the docs URL for redirect after login
      const currentUrl = new URL(request.url);
      const redirectUrl = currentUrl.toString();
      
      // Construct Better Auth signin URL with callback
      const baseURL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
      const signinUrl = `${baseURL}/api/auth/signin/cognito?callbackURL=${encodeURIComponent(redirectUrl)}`;
      
      return new Response(null, {
        status: 302,
        headers: {
          'Location': signinUrl,
        },
      });
    }
    
    // User is authenticated - serve Swagger UI HTML
    // The OpenAPI spec is served at /api/docs/openapi.yaml
    const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Syniad API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = async function() {
      // Helper function to get session token
      const getSessionToken = async () => {
        try {
          const response = await fetch('/api/docs/session-token', {
            credentials: 'include' // Include cookies for session
          });
          const data = await response.json();
          if (data.authenticated && data.token) {
            return data.token;
          }
        } catch (error) {
          console.warn('[Swagger UI] Could not fetch session token:', error);
        }
        return null;
      };
      
      // Try to get the user's session token automatically on page load
      let sessionToken = await getSessionToken();
      if (sessionToken) {
        console.log('[Swagger UI] Auto-authenticated with session token');
      } else {
        console.warn('[Swagger UI] No session token available - user must log in');
      }
      
      const ui = SwaggerUIBundle({
        url: '/api/docs/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        validatorUrl: null, // Disable validator to avoid external requests
        onComplete: () => {
          // Auto-authorize with session token if available
          if (sessionToken) {
            // Use the preauthorizeApiKey method for Bearer token auth
            ui.preauthorizeApiKey('BearerAuth', sessionToken);
            console.log('[Swagger UI] Pre-authorized with session token');
          } else {
            console.warn('[Swagger UI] No session token available - user must log in');
          }
        },
        requestInterceptor: async (request) => {
          // Always ensure bearer token is sent with all requests
          // If Swagger UI hasn't added it, use the session token or fetch a fresh one
          if (!request.headers.Authorization) {
            // Use cached token if available, otherwise fetch fresh
            const token = sessionToken || await getSessionToken();
            if (token) {
              request.headers.Authorization = 'Bearer ' + token;
              // Update cached token if we fetched a fresh one
              if (!sessionToken) {
                sessionToken = token;
              }
            } else {
              console.warn('[Swagger UI] No authentication token available for request');
            }
          }
          
          // Ensure Authorization header is properly formatted
          if (request.headers.Authorization && !request.headers.Authorization.startsWith('Bearer ')) {
            request.headers.Authorization = 'Bearer ' + request.headers.Authorization;
          }
          
          return request;
        },
        responseInterceptor: (response) => {
          // Log response for debugging (optional)
          if (response.status >= 400) {
            console.warn('[Swagger UI] API request failed:', response.status, response.url);
          }
          return response;
        }
      });
    };
  </script>
</body>
</html>`;
    
    return new Response(swaggerHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

