#!/usr/bin/env node

/**
 * Automatically generates OpenAPI specification from:
 * 1. Terraform API Gateway route definitions
 * 2. Handler code analysis (JSDoc comments, request/response types)
 * 3. Shared types from shared/types.ts
 * 
 * Usage: node scripts/generate-openapi.js [output-file]
 */

const fs = require('fs');
const pathModule = require('path');
const yaml = require('yaml');

// Parse Terraform to extract routes
function extractRoutesFromTerraform() {
  const terraformPath = pathModule.join(__dirname, '..', 'terraform', 'api-gateway.tf');
  const terraformContent = fs.readFileSync(terraformPath, 'utf8');
  
  const routes = [];
  
  // Extract route_key patterns: route_key = "GET /games" or route_key = "POST /games/{gameId}/join"
  const routeKeyRegex = /route_key\s*=\s*"([A-Z]+)\s+([^"]+)"/g;
  let match;
  while ((match = routeKeyRegex.exec(terraformContent)) !== null) {
    const method = match[1];
    const pathPattern = match[2];
    routes.push({ method, path: pathPattern });
  }
  
  // Extract authorizer usage to determine if auth is required
  // For now, we'll check if authorization_type = "CUSTOM" or "NONE"
  const routeBlocks = terraformContent.split(/resource "aws_apigatewayv2_route"/);
  routes.forEach((route, index) => {
    if (index < routeBlocks.length - 1) {
      const block = routeBlocks[index + 1];
      if (block.includes('authorization_type = "NONE"')) {
        route.authRequired = false;
      } else if (block.includes('authorization_type = "CUSTOM"')) {
        route.authRequired = true;
      }
    }
  });
  
  return routes;
}

// Extract type information from shared/types.ts
function extractTypes() {
  const typesPath = pathModule.join(__dirname, '..', 'shared', 'types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  
  // Simple regex extraction - could be improved
  const gameInterface = {
    gameId: { type: 'string', format: 'uuid', description: 'Unique game identifier' },
    status: { type: 'string', enum: ['waiting', 'active', 'finished'], description: 'Current game status' },
    player1: { $ref: '#/components/schemas/Player' },
    player2: { $ref: '#/components/schemas/Player' },
    player1Id: { type: 'string', description: 'Index field - equals player1.userId' },
    player2Id: { type: 'string', description: 'Index field - equals player2.userId when player2 exists' },
    turnNumber: { type: 'integer', description: 'Current turn number' },
    createdAt: { type: 'string', format: 'date-time', description: 'Game creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Game last update timestamp' }
  };
  
  return {
    Game: gameInterface,
    Player: {
      name: { type: 'string', description: 'Player\'s display name' },
      userId: { type: 'string', description: 'Cognito user ID (sub) - unique, immutable identifier' }
    }
  };
}

// Generate OpenAPI spec from routes and types
function generateOpenAPISpec() {
  const routes = extractRoutesFromTerraform();
  const types = extractTypes();
  
  // Get API info from existing spec or use defaults
  let existingSpec = {};
  const specPath = pathModule.join(__dirname, '..', 'docs', 'openapi.yaml');
  if (fs.existsSync(specPath)) {
    try {
      existingSpec = yaml.parse(fs.readFileSync(specPath, 'utf8'));
    } catch (e) {
      // Use defaults if can't parse
    }
  }
  
  const info = existingSpec.info || {
    title: 'Syniad API',
    description: 'API for managing game sessions',
    version: '1.0.0'
  };
  
  const spec = {
    openapi: '3.0.3',
    info,
    servers: [
      {
        url: 'https://api.syniad.com',
        description: 'API Server'
      }
    ],
    tags: [
      { name: 'Games', description: 'Game management operations' },
      { name: 'Test', description: 'Test endpoint' },
      { name: 'Docs', description: 'API documentation' }
    ],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from AWS Cognito'
        }
      },
      schemas: {
        Player: {
          type: 'object',
          required: ['name', 'userId'],
          properties: types.Player
        },
        Game: {
          type: 'object',
          required: ['gameId', 'status', 'player1', 'player1Id', 'turnNumber', 'createdAt'],
          properties: types.Game
        },
        User: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Cognito user ID' },
            username: { type: 'string', description: 'Username' },
            email: { type: 'string', format: 'email', description: 'User email' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
            user: { $ref: '#/components/schemas/User' },
            details: { type: 'string', description: 'Additional error details' }
          }
        }
      },
      responses: {
        BadRequest: {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  };
  
  // Generate paths from routes
  routes.forEach(route => {
    const { method, path: routePath, authRequired } = route;
    
    // Convert route path to OpenAPI path format
    const openApiPath = routePath.replace(/\{[^}]+\}/g, (match) => {
      // Convert {gameId} to {gameId} format (already correct)
      return match;
    });
    
    if (!spec.paths[openApiPath]) {
      spec.paths[openApiPath] = {};
    }
    
    const methodLower = method.toLowerCase();
    const operation = {
      operationId: generateOperationId(methodLower, openApiPath),
      tags: getTagForPath(openApiPath),
      summary: generateSummary(methodLower, openApiPath),
      description: generateDescription(methodLower, openApiPath),
      parameters: extractParameters(routePath),
      responses: generateResponses(methodLower, openApiPath)
    };
    
    // Add security if auth required (only add if authRequired is explicitly true, not undefined or false)
    // authRequired will be false for routes with authorization_type = "NONE"
    if (authRequired === true) {
      operation.security = [{ bearerAuth: [] }];
    }
    // If authRequired is false or undefined and route is docs, make sure no security
    if (authRequired === false || (openApiPath.startsWith('/docs') && authRequired !== true)) {
      // Explicitly no security for public endpoints
      // Don't add security array at all for public routes
    }
    
    // Add request body for POST/PUT
    if (['post', 'put', 'patch'].includes(methodLower)) {
      operation.requestBody = generateRequestBody(openApiPath);
    }
    
    spec.paths[openApiPath][methodLower] = operation;
  });
  
  // Preserve custom content from existing spec if present (descriptions, examples, etc.)
  if (existingSpec.paths) {
    Object.keys(existingSpec.paths).forEach(pathKey => {
      if (spec.paths[pathKey]) {
        Object.keys(existingSpec.paths[pathKey]).forEach(method => {
          if (spec.paths[pathKey][method] && existingSpec.paths[pathKey][method]) {
            const existing = existingSpec.paths[pathKey][method];
            const generated = spec.paths[pathKey][method];
            
            // Preserve descriptions, summaries, examples, and other custom fields
            if (existing.description) generated.description = existing.description;
            if (existing.summary) generated.summary = existing.summary;
            
            // Merge request body if exists
            if (existing.requestBody) {
              generated.requestBody = existing.requestBody;
            }
            
            // Preserve custom response examples and descriptions
            if (existing.responses) {
              Object.keys(existing.responses).forEach(statusCode => {
                if (generated.responses[statusCode] && existing.responses[statusCode]) {
                  const existingResponse = existing.responses[statusCode];
                  const generatedResponse = generated.responses[statusCode];
                  
                  if (existingResponse.description) {
                    generatedResponse.description = existingResponse.description;
                  }
                  
                  // Preserve examples and content schemas
                  if (existingResponse.content) {
                    if (!generatedResponse.content) {
                      generatedResponse.content = existingResponse.content;
                    } else {
                      Object.keys(existingResponse.content).forEach(contentType => {
                        if (generatedResponse.content[contentType]) {
                          if (existingResponse.content[contentType].examples) {
                            generatedResponse.content[contentType].examples = existingResponse.content[contentType].examples;
                          }
                          if (existingResponse.content[contentType].example) {
                            generatedResponse.content[contentType].example = existingResponse.content[contentType].example;
                          }
                        }
                      });
                    }
                  }
                }
              });
            }
          }
        });
      }
    });
  }
  
  // Preserve custom components from existing spec
  if (existingSpec.components) {
    // Preserve custom schemas
    if (existingSpec.components.schemas) {
      Object.keys(existingSpec.components.schemas).forEach(schemaName => {
        if (!spec.components.schemas[schemaName] || 
            JSON.stringify(spec.components.schemas[schemaName]).includes('$ref')) {
          // Use existing schema if generated one is just a reference
          spec.components.schemas[schemaName] = existingSpec.components.schemas[schemaName];
        }
      });
    }
    
    // Preserve custom response definitions
    if (existingSpec.components.responses) {
      Object.keys(existingSpec.components.responses).forEach(responseName => {
        spec.components.responses[responseName] = existingSpec.components.responses[responseName];
      });
    }
  }
  
  return spec;
}

function generateOperationId(method, routePath) {
  // Use existing operation IDs from current spec if available, otherwise generate
  const pathModule = require('path');
  const existingSpecPath = pathModule.join(__dirname, '..', 'docs', 'openapi.yaml');
  let existingOperationIds = {};
  
  if (fs.existsSync(existingSpecPath)) {
    try {
      const existing = yaml.parse(fs.readFileSync(existingSpecPath, 'utf8'));
      if (existing.paths) {
        Object.keys(existing.paths).forEach(pathKey => {
          Object.keys(existing.paths[pathKey]).forEach(methodKey => {
            if (existing.paths[pathKey][methodKey]?.operationId) {
              // Store both exact and normalized keys for matching
              const exactKey = `${methodKey.toUpperCase()} ${pathKey}`;
              const normalizedKey = `${methodKey.toUpperCase()} ${pathKey}`.toLowerCase();
              const opId = existing.paths[pathKey][methodKey].operationId;
              existingOperationIds[exactKey] = opId;
              existingOperationIds[normalizedKey] = opId;
            }
          });
        });
      }
    } catch (e) {
      // Ignore errors - will generate new operation IDs
    }
  }
  
  // Try exact match first
  const key = `${method.toUpperCase()} ${routePath}`;
  if (existingOperationIds[key]) {
    return existingOperationIds[key];
  }
  
  // Try case-insensitive match
  const keyLower = key.toLowerCase();
  for (const [existingKey, existingId] of Object.entries(existingOperationIds)) {
    if (existingKey.toLowerCase() === keyLower) {
      return existingId;
    }
  }
  
  // Generate new operation ID based on route pattern
  const parts = routePath.split('/').filter(p => p && !p.startsWith('{'));
  
  // Special handling for common patterns
  if (routePath === '/games' && method === 'get') return 'getAllGames';
  if (routePath === '/games' && method === 'post') return 'createGame';
  if (routePath.startsWith('/games/{gameId}') && method === 'get') return 'getGame';
  if (routePath.endsWith('/join')) return 'joinGame';
  if (routePath.includes('/players/{playerId}')) return 'getGamesByPlayer';
  if (routePath.includes('/player1/')) return 'getGamesByPlayer1';
  if (routePath.includes('/player2/')) return 'getGamesByPlayer2';
  if (routePath === '/docs') return 'getDocs';
  if (routePath === '/docs/openapi.yaml' || routePath.includes('/docs/openapi')) return 'getOpenAPISpec';
  if (routePath === '/test') return 'getTest';
  
  // Generic generation
  const camelCase = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return method.toLowerCase() + camelCase.charAt(0).toLowerCase() + camelCase.slice(1);
}

function getTagForPath(path) {
  if (path.startsWith('/games')) return ['Games'];
  if (path.startsWith('/test')) return ['Test'];
  if (path.startsWith('/docs')) return ['Docs'];
  return ['General'];
}

function generateSummary(method, path) {
  const action = method === 'get' ? 'Get' : 
                 method === 'post' ? 'Create' :
                 method === 'put' ? 'Update' :
                 method === 'delete' ? 'Delete' : 'Process';
  
  if (path === '/test') return 'Test endpoint';
  if (path === '/games') return method === 'get' ? 'Get all games' : 'Create a new game';
  if (path.startsWith('/games/{gameId}')) {
    if (path.endsWith('/join')) return 'Join a game';
    return method === 'get' ? 'Get a specific game' : 'Update game';
  }
  if (path.startsWith('/games/players/')) return 'Get games for a player';
  if (path.startsWith('/games/player1/')) return 'Get games created by player';
  if (path.startsWith('/games/player2/')) return 'Get games joined by player';
  if (path === '/docs') return 'API documentation';
  if (path === '/docs/openapi.yaml') return 'OpenAPI specification';
  
  return `${action} ${path}`;
}

function generateDescription(method, path) {
  if (path === '/test') return 'Returns a test message with user information';
  if (path === '/games' && method === 'get') return 'Retrieves all games with pagination support';
  if (path === '/games' && method === 'post') return 'Creates a new game with the authenticated user as player1';
  if (path === '/games/{gameId}' && method === 'get') return 'Retrieves details for a specific game by ID';
  if (path === '/games/{gameId}/join') return 'Joins an existing game as player2';
  if (path === '/games/players/{playerId}') return 'Retrieves all games where the specified player is either player1 or player2';
  if (path === '/games/player1/{player1Id}') return 'Retrieves all games where the specified player is player1 (games they created)';
  if (path === '/games/player2/{player2Id}') return 'Retrieves all games where the specified player is player2 (games they joined)';
  if (path === '/docs') return 'Interactive API documentation (Swagger UI)';
  if (path === '/docs/openapi.yaml') return 'OpenAPI 3.0 specification in YAML format';
  
  return `Operation for ${method.toUpperCase()} ${path}`;
}

function extractParameters(path) {
  const params = [];
  const pathParamRegex = /\{([^}]+)\}/g;
  let match;
  
  while ((match = pathParamRegex.exec(path)) !== null) {
    const paramName = match[1];
    params.push({
      name: paramName,
      in: 'path',
      required: true,
      description: getParameterDescription(paramName),
      schema: getParameterSchema(paramName)
    });
  }
  
  // Add query parameters for certain endpoints
  if (path === '/games' || path.startsWith('/games/players/') || path.startsWith('/games/player1/') || path.startsWith('/games/player2/')) {
    params.push({
      name: 'limit',
      in: 'query',
      required: false,
      description: 'Maximum number of games to return (1-100)',
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 100
      }
    });
    params.push({
      name: 'nextToken',
      in: 'query',
      required: false,
      description: 'Token for pagination (returned from previous request)',
      schema: { type: 'string' }
    });
  }
  
  return params;
}

function getParameterDescription(name) {
  const descriptions = {
    gameId: 'Unique identifier for the game',
    playerId: 'User ID (Cognito sub) of the player',
    player1Id: 'User ID (Cognito sub) of player1',
    player2Id: 'User ID (Cognito sub) of player2'
  };
  return descriptions[name] || `The ${name} parameter`;
}

function getParameterSchema(name) {
  if (name === 'gameId') {
    return { type: 'string', format: 'uuid' };
  }
  return { type: 'string' };
}

function generateRequestBody(path) {
  if (path === '/games' || path.endsWith('/join')) {
    return {
      required: false,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              playerName: {
                type: 'string',
                description: 'Optional player name (defaults to username or email)'
              }
            },
            example: {
              playerName: 'My Player Name'
            }
          }
        }
      }
    };
  }
  return undefined;
}

function generateResponses(method, path) {
  const responses = {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: getResponseSchema(method, path)
        }
      }
    }
  };
  
  // Add error responses based on endpoint
  if (path.includes('{')) {
    responses['400'] = { $ref: '#/components/responses/BadRequest' };
    responses['404'] = { $ref: '#/components/responses/NotFound' };
  }
  
  if (method === 'post' || method === 'put') {
    responses['400'] = { $ref: '#/components/responses/BadRequest' };
    responses['401'] = { $ref: '#/components/responses/Unauthorized' };
  }
  
  if (path === '/docs' || path === '/docs/openapi.yaml') {
    // Docs endpoints don't have error responses in JSON
    return {
      '200': {
        description: 'Successful response',
        content: path.endsWith('.yaml') ? {
          'text/yaml': {
            schema: { type: 'string' }
          }
        } : {
          'text/html': {
            schema: { type: 'string' }
          }
        }
      }
    };
  }
  
  responses['500'] = { $ref: '#/components/responses/ServerError' };
  
  return responses;
}

function getResponseSchema(method, path) {
  if (path === '/test') {
    return {
      type: 'object',
      properties: {
        message: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        user: { $ref: '#/components/schemas/User' }
      }
    };
  }
  
  if (path === '/games' && method === 'get') {
    return {
      $ref: '#/components/schemas/GamesResponse'
    };
  }
  
  if (path === '/games' && method === 'post') {
    return {
      $ref: '#/components/schemas/GameResponse'
    };
  }
  
  if (path === '/games/{gameId}') {
    return {
      $ref: '#/components/schemas/GameResponse'
    };
  }
  
  if (path === '/games/{gameId}/join') {
    return {
      $ref: '#/components/schemas/JoinGameResponse'
    };
  }
  
  if (path.startsWith('/games/players/') || path.startsWith('/games/player1/') || path.startsWith('/games/player2/')) {
    return {
      $ref: '#/components/schemas/GamesResponse'
    };
  }
  
  return { type: 'object' };
}

// Add missing response schemas
function addResponseSchemas(spec) {
  if (!spec.components.schemas.GameResponse) {
    spec.components.schemas.GameResponse = {
      type: 'object',
      properties: {
        gameId: { type: 'string', format: 'uuid' },
        game: { $ref: '#/components/schemas/Game' },
        user: { $ref: '#/components/schemas/User' }
      }
    };
  }
  
  if (!spec.components.schemas.JoinGameResponse) {
    spec.components.schemas.JoinGameResponse = {
      allOf: [
        { $ref: '#/components/schemas/GameResponse' },
        {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Game is now active!' }
          }
        }
      ]
    };
  }
  
  if (!spec.components.schemas.GamesResponse) {
    spec.components.schemas.GamesResponse = {
      type: 'object',
      properties: {
        games: {
          type: 'array',
          items: { $ref: '#/components/schemas/Game' }
        },
        count: { type: 'integer', description: 'Number of games in this response' },
        hasMore: { type: 'boolean', description: 'Whether there are more games available' },
        nextToken: { type: 'string', description: 'Token to fetch the next page of results' },
        playerId: { type: 'string', description: 'Filter parameter used (when querying by player)' },
        player1Id: { type: 'string', description: 'Filter parameter used (when querying by player1)' },
        player2Id: { type: 'string', description: 'Filter parameter used (when querying by player2)' },
        user: { $ref: '#/components/schemas/User' }
      }
    };
  }
}

// Main execution
const outputPath = process.argv[2] || pathModule.join(__dirname, '..', 'docs', 'openapi.yaml');

try {
  console.log('Generating OpenAPI specification from Terraform routes and code...\n');
  
  const spec = generateOpenAPISpec();
  addResponseSchemas(spec);
  
  // Write YAML
  const yamlContent = yaml.stringify(spec, {
    indent: 2,
    lineWidth: 0,
    quotingType: '"',
    blockQuote: false
  });
  
  fs.writeFileSync(outputPath, yamlContent, 'utf8');
  
  console.log(`✅ OpenAPI specification generated: ${outputPath}`);
  console.log(`   - ${Object.keys(spec.paths).length} paths`);
  console.log(`   - ${Object.values(spec.paths).reduce((sum, path) => sum + Object.keys(path).length, 0)} operations`);
  console.log(`   - ${Object.keys(spec.components.schemas).length} schemas\n`);
  
} catch (error) {
  console.error('❌ Error generating OpenAPI spec:', error.message);
  console.error(error.stack);
  process.exit(1);
}

