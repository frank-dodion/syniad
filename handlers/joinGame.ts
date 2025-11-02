import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGame, saveGame } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';
import { Game, Player } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);
    const userId = user.userId;
    const username = user.username || '';
    const email = user.email || '';

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

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const playerName: string = body.playerName || username || email || 'Player2';
    
    // Get the game
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

    // Validate game status
    if (game.status !== 'waiting') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: `Cannot join game. Game status is: ${game.status}`,
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Check if game is already full (2 players)
    if (game.players.length >= 2) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Game is full (maximum 2 players)',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Prevent user from joining their own game
    if (userId && game.players.some(p => p.userId === userId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'You are already in this game',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }

    // Add the new player
    const newPlayer: Player = {
      name: playerName,
      userId: userId,
      playerIndex: 1
    };
    
    game.players.push(newPlayer);
    
    // Update first player's index if not set
    if (game.players[0].playerIndex === undefined) {
      game.players[0].playerIndex = 0;
    }

    // Change status to 'active' when second player joins
    if (game.players.length === 2) {
      game.status = 'active';
    }

    // Update timestamp
    game.updatedAt = new Date().toISOString();

    // Save the updated game
    await saveGame(game);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        gameId,
        game,
        message: game.status === 'active' ? 'Game is now active!' : 'Joined game successfully',
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error joining game:', error);
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

