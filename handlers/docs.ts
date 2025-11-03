import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Handler for serving API documentation
 * GET /docs - serves Swagger UI HTML
 * GET /docs/openapi.yaml - serves OpenAPI specification
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get path from various possible locations (HTTP API vs REST API)
    const path = event.path || (event.requestContext as any)?.http?.path || (event as any)?.rawPath || '';
    
    // Determine which resource is being requested
    if (path.endsWith('/openapi.yaml') || path.endsWith('/openapi.yml') || path.includes('openapi')) {
      // Serve OpenAPI spec as YAML
      return serveOpenAPISpec(event);
    } else {
      // Serve Swagger UI HTML
      return serveSwaggerUI(event);
    }
  } catch (error) {
    console.error('Error serving docs:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

function serveOpenAPISpec(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  // Read OpenAPI spec from the bundled Lambda package
  // The spec is copied to docs/ directory during build
  let specContent: string | null = null;
  
  // Try different possible locations
  const possiblePaths = [
    join(__dirname, 'docs', 'openapi.yaml'), // Primary location (from build)
    join(process.cwd(), 'docs', 'openapi.yaml'), // Current working directory
    join(__dirname, '..', 'docs', 'openapi.yaml'), // Relative to handler
    '/opt/docs/openapi.yaml', // Lambda layer location (if used)
  ];
  
  let found = false;
  for (const specPath of possiblePaths) {
    try {
      specContent = readFileSync(specPath, 'utf8');
      found = true;
      break;
    } catch (error) {
      // Continue to next path
    }
  }
  
  if (!found || !specContent) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'OpenAPI specification not found',
        attemptedPaths: possiblePaths
      })
    };
  }

  // Get the API base URL for the spec
  const host = event.headers?.Host || (event.requestContext as any)?.domainName || '';
  const protocol = event.headers?.['X-Forwarded-Proto'] || 
                   (event.headers?.['x-forwarded-proto'] || 'https');
  const apiBaseUrl = `${protocol}://${host}`;

  // Replace server URLs in spec with actual API URL if needed
  // This ensures Swagger UI uses the correct server
  const updatedSpec = specContent.replace(
    /https?:\/\/[^\s]+/g,
    apiBaseUrl
  );

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    },
    body: updatedSpec
  };
}

function serveSwaggerUI(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  // Get the API base URL
  const host = event.headers?.Host || (event.requestContext as any)?.domainName || '';
  const protocol = event.headers?.['X-Forwarded-Proto'] || 
                   (event.headers?.['x-forwarded-proto'] || 'https');
  const apiBaseUrl = `${protocol}://${host}`;
  const openApiUrl = `${apiBaseUrl}/docs/openapi.yaml`;

  // Swagger UI HTML with inline configuration
  const swaggerUIHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Syniad API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${openApiUrl}',
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
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        filter: true,
        displayOperationId: false,
        requestInterceptor: (request) => {
          // Auto-add Bearer token from localStorage if available
          const token = localStorage.getItem('auth_token');
          if (token && request.headers) {
            request.headers['Authorization'] = 'Bearer ' + token;
          }
          return request;
        },
        responseInterceptor: (response) => {
          return response;
        },
        onComplete: function() {
          console.log('Swagger UI loaded successfully');
        }
      });

      // Helper function to set auth token
      window.setAuthToken = function(token) {
        localStorage.setItem('auth_token', token);
        window.location.reload();
      };

      // Check if token is set
      window.addEventListener('load', function() {
        const token = localStorage.getItem('auth_token');
        if (token) {
          console.log('Auth token is set in localStorage');
          console.log('Token preview:', token.substring(0, 20) + '...');
        } else {
          console.log('No auth token set. Use setAuthToken(token) in console to set it.');
        }
      });
    };
  </script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    },
    body: swaggerUIHTML
  };
}

