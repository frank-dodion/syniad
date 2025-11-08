import { NextRequest } from 'next/server';
import { generateOpenApi } from '@ts-rest/open-api';
import { contract } from '@/shared/contract';

// GET /api/docs/openapi.yaml - Generate and serve OpenAPI specification from contract
export async function GET(request: NextRequest) {
  try {
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
              description: 'Cognito ID token. Get your token by logging in at the main app, then run ./scripts/test-cognito-auth.sh to get your ID_TOKEN.',
            },
          },
        },
      },
      {
        operationMapper: (operation, appRoute) => {
          // Endpoints that require authentication (return 401 if not authenticated)
          // Check the route path or method to determine if auth is required
          const requiresAuth = [
            'createGame',
            'joinGame',
            'deleteGame',
            'createScenario',
            'updateScenario',
            'deleteScenario',
          ];
          
          // Get the route ID from the path
          const routeId = Object.keys(contract).find(key => {
            const route = contract[key as keyof typeof contract];
            return route.path === appRoute.path && route.method === appRoute.method;
          });
          
          if (routeId && requiresAuth.includes(routeId)) {
            return {
              ...operation,
              security: [{ BearerAuth: [] }],
            };
          }
          
          return operation;
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

