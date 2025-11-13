import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getGame, saveGame } from '@/lib/api-db';
import { Game } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validatePathParams,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';

// POST /api/games/[gameId]/join - Join a game as player2
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const userId = user?.userId;
    
    if (!userId) {
      return createErrorResponse(401, 'Authentication required - userId not found in token');
    }

    const pathParams = await params;
    const validation = validatePathParams(contract.joinGame, pathParams);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { gameId } = validation.data;

    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found', user);
    }

    // Check if game is waiting (no player2) - status is derived dynamically
    if (game.player2) {
      return createErrorResponse(400, 'Game already has two players', user);
    }

    if (game.player1.userId === userId) {
      return createErrorResponse(400, 'Cannot join your own game', user);
    }

    const playerName = user?.email || `User-${userId.substring(0, 8)}`;
    
    const updatedGame: Game = {
      ...game,
      player2: {
        name: playerName,
        userId: userId
      },
      player2Id: userId,
      // Status is derived dynamically - no need to store it
      updatedAt: new Date().toISOString()
    };
    
    await saveGame(updatedGame);
    
    const response = { gameId, game: updatedGame };
    const responseValidation = validateResponse(contract.joinGame, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error joining game:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

