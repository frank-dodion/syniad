import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getScenario, getAllScenarios } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    
    // Check if this is a request for a specific scenario or all scenarios
    const scenarioId = event.pathParameters?.scenarioId;
    
    if (scenarioId) {
      // GET /scenarios/{scenarioId} - Get specific scenario
      const scenario = await getScenario(scenarioId);
      
      if (!scenario) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'Scenario not found',
            scenarioId,
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          scenarioId,
          scenario,
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    } else {
      // GET /scenarios - Get all scenarios with pagination
      const limitParam = event.queryStringParameters?.limit;
      const nextToken = event.queryStringParameters?.nextToken;
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      
      // Validate limit (max 100 to prevent large responses)
      if (limit && (limit < 1 || limit > 100)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'limit must be between 1 and 100',
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      }
      
      const paginated = await getAllScenarios(limit, nextToken);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          scenarios: paginated.items,
          count: paginated.items.length,
          hasMore: paginated.hasMore,
          ...(paginated.nextToken && { nextToken: paginated.nextToken }),
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
  } catch (error) {
    console.error('Error getting scenarios:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        user: extractUserIdentity(event)
      })
    };
  }
};

