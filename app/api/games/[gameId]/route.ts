import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getGame, deleteGame, saveGame } from '@/lib/api-db';
import { Game, PlayerNumber, GamePhase, GameAction, UnitStatus } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validatePathParams,
  validateRequestBody,
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
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }
    
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

// PATCH /api/games/[gameId] - Update game (title or reset status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    
    if (!user || !user.userId) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    const pathParams = await params;
    const pathValidation = validatePathParams(contract.getGame, pathParams);
    if (!pathValidation.valid) {
      return createErrorResponse(400, pathValidation.error, user);
    }

    const { gameId } = pathValidation.data;

    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found', user);
    }
    
    // Only player1 (creator) can update the game
    if (game.player1.userId !== user.userId) {
      return createErrorResponse(403, 'Only the game creator can update the game', user);
    }
    
    const body = await request.json();
    const { title, status } = body;
    
    const updatedGame: Game = {
      ...game,
      updatedAt: new Date().toISOString()
    };
    
    // Update title if provided
    if (title !== undefined) {
      updatedGame.title = title;
    }
    
    // Handle status reset (remove player2 to reset to waiting state)
    if (status === 'waiting') {
      // Check if game is already waiting (no player2)
      if (!game.player2) {
        return createErrorResponse(400, 'Game is already waiting for players. Cannot reset.', user);
      }
      // Reset game by removing player2 and resetting game state
      updatedGame.player2 = undefined;
      updatedGame.player2Id = undefined;
      const scenarioUnits = updatedGame.scenarioSnapshot.units || [];
      const initialActivePlayer = PlayerNumber.Player1;
      const resetUnits = scenarioUnits.map(unit => ({
        ...unit,
        status: (unit.player === initialActivePlayer ? 'available' : 'unavailable') as UnitStatus,
        startingColumn: unit.column,
        startingRow: unit.row,
      }));
      updatedGame.gameState = {
        turnNumber: 1,
        activePlayer: PlayerNumber.Player1,
        phase: GamePhase.Movement,
        action: GameAction.SelectUnit,
        units: resetUnits,
      };
    }
    
    await saveGame(updatedGame);
    
    const response = { gameId, game: updatedGame };
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error updating game:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

