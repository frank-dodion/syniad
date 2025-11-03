import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllGames, getGamesByPlayer, getGamesByCreator } from '../lib/db';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user identity from authorizer context
    const user = extractUserIdentity(event);

    // Check query parameters for filtering
    const playerId = event.queryStringParameters?.playerId;
    const creatorId = event.queryStringParameters?.creatorId;
    
    let games;
    if (creatorId) {
      // Get games created by specific user (uses GSI - efficient!)
      games = await getGamesByCreator(creatorId);
    } else if (playerId) {
      // Get games for specific player (all games they're in)
      games = await getGamesByPlayer(playerId);
    } else {
      // Get all games
      games = await getAllGames();
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        games,
        count: games.length,
        ...(playerId && { playerId }),
        ...(creatorId && { creatorId }),
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

