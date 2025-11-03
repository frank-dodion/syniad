import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGame, deleteGame } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    const userId = user.userId;
    
    // userId is required - it's the Cognito sub (unique, immutable identifier)
    if (!userId) {
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

    // Extract gameId from path parameters
    const gameId = event.pathParameters?.gameId;
    
    if (!gameId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing gameId in path',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Get the game to check ownership
    const game = await getGame(gameId);
    
    if (!game) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Game not found',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Only Player 1 (the creator) can delete the game
    if (game.player1.userId !== userId) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Forbidden: Only the game creator (Player 1) can delete the game',
          gameId,
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Delete the game
    await deleteGame(gameId);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        message: 'Game deleted successfully',
        gameId,
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error deleting game:', error);
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

