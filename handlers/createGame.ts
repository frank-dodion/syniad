import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { saveGame, getScenario } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';
import { Game, Player } from '../shared/types';

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

    // Parse request body to get scenarioId
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            error: 'Invalid JSON in request body',
            user: {
              userId: user.userId,
              username: user.username,
              email: user.email
            }
          })
        };
      }
    }
    
    const scenarioId = body.scenarioId;
    
    if (!scenarioId || typeof scenarioId !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Missing or invalid scenarioId field',
          user: {
            userId: user.userId,
            username: user.username,
            email: user.email
          }
        })
      };
    }
    
    // Validate that the scenario exists
    const scenario = await getScenario(scenarioId);
    if (!scenario) {
      return {
        statusCode: 400,
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
    
    // Use authenticated user for player1 - no payload needed
    const playerName = user.username || user.email || `User-${userId.substring(0, 8)}`;
    
    const gameId = uuidv4();
    const game: Game = {
      gameId,
      status: 'waiting',
      scenarioId, // Reference to the scenario
      player1: { 
        name: playerName, 
        userId: userId // Required: Cognito sub - Creator is always Player 1
      },
      // player2 will be set when someone joins
      player1Id: userId, // Index: Player1's userId for efficient "games created by player1" queries
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

