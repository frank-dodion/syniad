import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getGame, deleteGame } from '@/lib/api-db';
import { contract } from '@/shared/contract';
import {
  validatePathParams,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';

// GET /api/games/[gameId] - Get a specific game
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const pathParams = await params;
    
    const validation = validatePathParams(contract.getGame, pathParams);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { gameId } = validation.data;

    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found', user);
    }
    
    const response = { gameId, game };
    const responseValidation = validateResponse(contract.getGame, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error getting game:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// DELETE /api/games/[gameId] - Delete a game
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    const pathParams = await params;
    const validation = validatePathParams(contract.deleteGame, pathParams);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { gameId } = validation.data;

    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found', user);
    }
    
    // Only player1 (creator) can delete the game
    if (game.player1.userId !== user.userId) {
      return createErrorResponse(403, 'Only the game creator can delete the game', user);
    }
    
    await deleteGame(gameId);
    
    const response = {
      message: 'Game deleted successfully',
      gameId,
    };
    const responseValidation = validateResponse(contract.deleteGame, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error deleting game:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

