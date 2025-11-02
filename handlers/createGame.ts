import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { saveGame } from '../lib/db';
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

    const body = event.body ? JSON.parse(event.body) : {};
    const playerName: string = body.playerName || username || email || 'Player1';
    
    const gameId = uuidv4();
    const game: Game = {
      gameId,
      status: 'waiting',
      players: [{ 
        name: playerName, 
        userId: userId,
        playerIndex: 0 
      } as Player],
      turnNumber: 1,
      createdAt: new Date().toISOString()
    };
    
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
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        }
      })
    };
  } catch (error) {
    console.error('Error creating game:', error);
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

