import { NextRequest } from 'next/server';
import { extractUserIdentity, createApiResponse } from '@/lib/api-auth';
import { getGame, deleteGame } from '@/lib/api-db';

// GET /api/games/[gameId] - Get a specific game
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const { gameId } = await params;
    
    if (!gameId) {
      return createApiResponse(400, {
        error: 'Missing gameId in path'
      }, user);
    }

    const game = await getGame(gameId);
    
    if (!game) {
      return createApiResponse(404, {
        error: 'Game not found'
      }, user);
    }
    
    return createApiResponse(200, {
      gameId,
      game
    }, user);
  } catch (error) {
    console.error('Error getting game:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      return createApiResponse(401, {
        error: 'Authentication required'
      });
    }
    
    const { gameId } = await params;
    
    if (!gameId) {
      return createApiResponse(400, {
        error: 'Missing gameId in path'
      }, user);
    }

    const game = await getGame(gameId);
    
    if (!game) {
      return createApiResponse(404, {
        error: 'Game not found'
      }, user);
    }
    
    // Only player1 (creator) can delete the game
    if (game.player1.userId !== user.userId) {
      return createApiResponse(403, {
        error: 'Only the game creator can delete the game'
      }, user);
    }
    
    await deleteGame(gameId);
    
    return createApiResponse(200, {
      message: 'Game deleted successfully',
      gameId
    }, user);
  } catch (error) {
    console.error('Error deleting game:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

