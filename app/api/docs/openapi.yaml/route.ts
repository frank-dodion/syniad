import { NextRequest } from 'next/server';
import { generateOpenApi } from '@ts-rest/open-api';
import { contract } from '@/shared/contract';
import { extractUserIdentity } from '@/lib/api-auth';

// GET /api/docs/openapi.yaml - Generate and serve OpenAPI specification from contract (requires authentication)
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      // Redirect to login - preserve the OpenAPI spec URL for redirect after login
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
    
    // User is authenticated - generate and serve OpenAPI spec
    // Generate OpenAPI spec from ts-rest contract
    const openApiDocument = generateOpenApi(
      contract,
      {
        info: {
          title: 'Syniad API',
          version: '1.0.0',
          description: 'API for managing game sessions and scenarios',
        },
        servers: [
          {
            // Always use deployed dev API for Swagger docs, even when running locally
            // This allows local Swagger UI to test against deployed AWS resources
            url: 'https://dev.syniad.net',
            description: 'Deployed Dev API Server',
          },
        ],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Cognito ID token. All endpoints require authentication. The token is automatically retrieved from your session when you are logged in to the main app.',
            },
          },
        },
      },
      {
        operationMapper: (operation, appRoute) => {
          // ALL endpoints require authentication
          // Mark every operation with BearerAuth security requirement
          return {
            ...operation,
            security: [{ BearerAuth: [] }],
          };
        },
      }
    );

    // Convert to YAML format
    // Note: @ts-rest/open-api returns JSON, we'll serve it as JSON
    // Swagger UI can consume JSON OpenAPI specs
    const yaml = JSON.stringify(openApiDocument, null, 2);
    
    return new Response(yaml, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate OpenAPI specification',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

