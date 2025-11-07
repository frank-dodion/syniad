import { NextRequest } from 'next/server';
import { extractUserIdentity, createApiResponse } from '@/lib/api-auth';
import { saveGame, getAllGames } from '@/lib/api-db';
import { v4 as uuidv4 } from 'uuid';
import { Game } from '../../../../shared/types';

// POST /api/games - Create a new game
export async function POST(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createApiResponse(401, {
        error: 'Authentication required - userId not found in token'
      });
    }

    const body = await request.json();
    const scenarioId = body.scenarioId;
    
    if (!scenarioId || typeof scenarioId !== 'string') {
      return createApiResponse(400, {
        error: 'Missing or invalid scenarioId field'
      }, user);
    }
    
    // Import getScenario from api-db
    const { getScenario } = await import('@/lib/api-db');
    const scenario = await getScenario(scenarioId);
    if (!scenario) {
      return createApiResponse(400, {
        error: 'Scenario not found',
        scenarioId
      }, user);
    }
    
    const playerName = user.username || user.email || `User-${user.userId.substring(0, 8)}`;
    
    const gameId = uuidv4();
    const game: Game = {
      gameId,
      status: 'waiting',
      scenarioId,
      player1: { 
        name: playerName, 
        userId: user.userId
      },
      player1Id: user.userId,
      turnNumber: 1,
      createdAt: new Date().toISOString()
    };
    
    await saveGame(game);
    
    return createApiResponse(200, {
      gameId,
      game
    }, user);
  } catch (error) {
    console.error('Error creating game:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// GET /api/games - Get all games (with optional query params for filtering)
export async function GET(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const nextToken = searchParams.get('nextToken');
    const playerId = searchParams.get('playerId');
    const player1Id = searchParams.get('player1Id');
    const player2Id = searchParams.get('player2Id');
    
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    
    if (limit && (limit < 1 || limit > 100)) {
      return createApiResponse(400, {
        error: 'limit must be between 1 and 100'
      }, user);
    }
    
    const result = await getAllGames(limit, nextToken || undefined, playerId || undefined, player1Id || undefined, player2Id || undefined);
    
    return createApiResponse(200, {
      games: result.items,
      count: result.items.length,
      hasMore: result.hasMore,
      nextToken: result.nextToken
    }, user);
  } catch (error) {
    console.error('Error getting games:', error);
    return createApiResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

