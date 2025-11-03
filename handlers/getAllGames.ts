import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllGames, getGamesByPlayer, getGamesByPlayer1, getGamesByPlayer2 } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    const userId = user.userId;

    // Check if this is a "get my games" endpoint (GET /games/my, /games/my/player1, /games/my/player2)
    // Get path from various possible locations (HTTP API vs REST API)
    const path = event.path || (event.requestContext as any)?.http?.path || (event.requestContext as any)?.path || (event as any)?.rawPath || '';
    const isMyGames = path === '/games/my' || path.endsWith('/games/my');
    const isMyGamesPlayer1 = path === '/games/my/player1' || path.endsWith('/games/my/player1');
    const isMyGamesPlayer2 = path === '/games/my/player2' || path.endsWith('/games/my/player2');

    // Check path parameters first (RESTful approach)
    // Path-based routes: /games/my, /games/players/{playerId}, /games/player1/{player1Id}, /games/player2/{player2Id}
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
    if (!userId && (isMyGames || isMyGamesPlayer1 || isMyGamesPlayer2)) {
      // All "my games" endpoints require authentication
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Authentication required - userId not found in token',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    if (isMyGamesPlayer1) {
      // GET /games/my/player1 - Get games where authenticated user is player1 (games they created)
      const paginated = await getGamesByPlayer1(userId!, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else if (isMyGamesPlayer2) {
      // GET /games/my/player2 - Get games where authenticated user is player2 (games they joined)
      const paginated = await getGamesByPlayer2(userId!, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else if (isMyGames) {
      // GET /games/my - Get games for authenticated user (all games they're in - player1 OR player2)
      const paginated = await getGamesByPlayer(userId!, limit, nextToken);
      result = {
        games: paginated.items,
        count: paginated.items.length,
        hasMore: paginated.hasMore,
        ...(paginated.nextToken && { nextToken: paginated.nextToken })
      };
    } else if (pathPlayer1Id) {
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

