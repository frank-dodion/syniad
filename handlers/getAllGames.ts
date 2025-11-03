import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllGames, getGamesByPlayer, getGamesByPlayer1, getGamesByPlayer2 } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);

    // Check path parameters first (RESTful approach)
    // Path-based routes: /games/players/{playerId}, /games/player1/{player1Id}, /games/player2/{player2Id}
    const pathPlayerId = event.pathParameters?.playerId;
    const pathPlayer1Id = event.pathParameters?.player1Id;
    const pathPlayer2Id = event.pathParameters?.player2Id;
    
    // Check query parameters for pagination (limit and nextToken)
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
    
    let result;
    // Prioritize path parameters over query parameters (more RESTful)
    if (pathPlayer1Id) {
      // GET /games/player1/{player1Id} - Get games where user is player1 (games they created)
      // Uses GSI on player1Id for efficiency
      const paginated = await getGamesByPlayer1(pathPlayer1Id, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        player1Id: pathPlayer1Id,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else if (pathPlayer2Id) {
      // GET /games/player2/{player2Id} - Get games where user is player2 (games they joined)
      // Uses GSI on player2Id for efficiency
      const paginated = await getGamesByPlayer2(pathPlayer2Id, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        player2Id: pathPlayer2Id,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else if (pathPlayerId) {
      // GET /games/players/{playerId} - Get games for specific player (all games they're in - player1 OR player2)
      const paginated = await getGamesByPlayer(pathPlayerId, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        playerId: pathPlayerId,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else {
      // GET /games - Get all games with pagination (query params: ?limit=10&nextToken=...)
      const paginated = await getAllGames(limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        ...result,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error getting games:', error);
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

