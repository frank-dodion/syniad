import { NextRequest } from 'next/server';

// GET /api/docs - Serve Swagger UI
export async function GET(request: NextRequest) {
  try {
    // Always serve Swagger UI HTML for /api/docs
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
      // Try to get the user's session token automatically
      let sessionToken = null;
      try {
        const response = await fetch('/api/docs/session-token', {
          credentials: 'include' // Include cookies for session
        });
        const data = await response.json();
        if (data.authenticated && data.token) {
          sessionToken = data.token;
          console.log('[Swagger UI] Auto-authenticated with session token');
        }
      } catch (error) {
        console.warn('[Swagger UI] Could not auto-authenticate:', error);
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
            // For Bearer token auth, we need to set the authorization directly
            // Swagger UI stores authorizations in its internal state
            try {
              // Use the preauthorizeApiKey method which works for Bearer tokens too
              ui.preauthorizeApiKey('BearerAuth', sessionToken);
              console.log('[Swagger UI] Pre-authorized with session token');
            } catch (error) {
              console.warn('[Swagger UI] Could not pre-authorize:', error);
              // Fallback: manually set authorization
              if (ui.getSystem().authActions) {
                ui.getSystem().authActions.authorize({
                  BearerAuth: {
                    name: 'BearerAuth',
                    schema: {
                      type: 'http',
                      scheme: 'bearer',
                      bearerFormat: 'JWT'
                    },
                    value: sessionToken
                  }
                });
              }
            }
          }
        },
        requestInterceptor: (request) => {
          // Ensure bearer token is sent with all requests
          // Swagger UI automatically adds Authorization header when user authorizes,
          // but we ensure it's properly formatted
          if (request.headers && request.headers.Authorization) {
            // Ensure it's in the correct format
            if (!request.headers.Authorization.startsWith('Bearer ')) {
              request.headers.Authorization = 'Bearer ' + request.headers.Authorization;
            }
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

