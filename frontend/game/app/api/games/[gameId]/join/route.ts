import { NextRequest } from 'next/server';
import { extractUserIdentity, createApiResponse } from '@/lib/api-auth';
import { getGame, saveGame } from '@/lib/api-db';
import { Game } from '../../../../../../shared/types';

// POST /api/games/[gameId]/join - Join a game as player2
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    const userId = user?.userId;
    
    if (!userId) {
      return createApiResponse(401, {
        error: 'Authentication required - userId not found in token'
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

    if (game.status !== 'waiting') {
      return createApiResponse(400, {
        error: 'Game is not waiting for players',
        status: game.status
      }, user);
    }

    if (game.player2) {
      return createApiResponse(400, {
        error: 'Game already has two players'
      }, user);
    }

    if (game.player1.userId === userId) {
      return createApiResponse(400, {
        error: 'Cannot join your own game'
      }, user);
    }

    const playerName = user?.username || user?.email || `User-${userId.substring(0, 8)}`;
    
    const updatedGame: Game = {
      ...game,
      player2: {
        name: playerName,
        userId: userId
      },
      player2Id: userId,
      status: 'active',
      updatedAt: new Date().toISOString()
    };
    
    await saveGame(updatedGame);
    
    return createApiResponse(200, {
      gameId,
      game: updatedGame
    }, user);
  } catch (error) {
    console.error('Error joining game:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

