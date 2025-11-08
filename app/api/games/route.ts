import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { saveGame, getAllGames } from '@/lib/api-db';
import { v4 as uuidv4 } from 'uuid';
import { Game } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validateRequestBody,
  validateQueryParams,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';

// POST /api/games - Create a new game
export async function POST(request: NextRequest) {
  try {
    console.log('[POST /api/games] Request received');
    console.log('[POST /api/games] Headers:', Object.fromEntries(request.headers.entries()));
    const user = await extractUserIdentity(request);
    console.log('[POST /api/games] User identity:', user ? { userId: user.userId, username: user.username } : 'null');
    
    if (!user || !user.userId) {
      console.log('[POST /api/games] Authentication failed - no user or userId');
      return createErrorResponse(401, 'Authentication required - userId not found in token');
    }

    const body = await request.json();
    const validation = validateRequestBody(contract.createGame, body);
    
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const { scenarioId } = validation.data;
    
    // Import getScenario from api-db
    const { getScenario } = await import('@/lib/api-db');
    const scenario = await getScenario(scenarioId);
    if (!scenario) {
      return createErrorResponse(400, `Scenario not found: ${scenarioId}`, user);
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
    
    const response = { gameId, game };
    const responseValidation = validateResponse(contract.createGame, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error creating game:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// GET /api/games - Get all games (with optional query params for filtering)
export async function GET(request: NextRequest) {
  try {
    const user = await extractUserIdentity(request);
    
    const { searchParams } = new URL(request.url);
    const validation = validateQueryParams(contract.getGames, searchParams);
    
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, user);
    }

    const query = validation.data || {};
    const limit = query.limit;
    const nextToken = query.nextToken;
    const playerId = query.playerId;
    const player1Id = query.player1Id;
    const player2Id = query.player2Id;
    
    if (limit && (limit < 1 || limit > 100)) {
      return createErrorResponse(400, 'limit must be between 1 and 100', user);
    }
    
    const result = await getAllGames(limit, nextToken, playerId, player1Id, player2Id);
    
    const response = {
      games: result.items,
      count: result.items.length,
      hasMore: result.hasMore,
      nextToken: result.nextToken,
    };
    const responseValidation = validateResponse(contract.getGames, 200, response);
    if (!responseValidation.valid) {
      console.error('Response validation failed:', responseValidation.error);
    }
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error getting games:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // CORS preflight cache (separate from response cache)
    },
  });
}

