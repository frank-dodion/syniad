import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { getGame, saveGame } from '@/lib/api-db';
import { broadcastToGame } from '@/lib/websocket-broadcast';
import { Game, GameState, PlayerNumber, GamePhase, GameAction, UnitStatus, ScenarioUnit, TerrainType } from '@/shared/types';
import { contract } from '@/shared/contract';
import {
  validatePathParams,
  validateResponse,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/ts-rest-adapter';
import { z } from 'zod';
import { calculateMovementRange } from '@/lib/hex-pathfinding';

// POST /api/games/[gameId]/events - Process game events (map clicks, etc.)
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
    const gameIdFromPath = pathParams.gameId;

    // Parse request body
    const body = await request.json();
    const { gameId, eventType, hex } = body;

    // Validate gameId is provided in payload
    if (!gameId) {
      return createErrorResponse(400, 'gameId is required in request body', user);
    }

    // Validate gameId matches path parameter
    if (gameId !== gameIdFromPath) {
      return createErrorResponse(400, 'gameId in body must match gameId in URL path', user);
    }

    // Validate event type
    if (!eventType || (eventType !== 'mapClick' && eventType !== 'endPhase' && eventType !== 'selectUnit')) {
      return createErrorResponse(400, 'Invalid event type. Expected "mapClick", "selectUnit", or "endPhase"', user);
    }

    // Get current game
    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found', user);
    }

    // Verify user is a player
    const isPlayer1 = game.player1Id === userId;
    const isPlayer2 = game.player2Id === userId;
    
    if (!isPlayer1 && !isPlayer2) {
      return createErrorResponse(403, 'Only players can perform game actions', user);
    }

    const cloneUnits = (units?: ScenarioUnit[]): ScenarioUnit[] =>
      (units ?? []).map(unit => ({ ...unit }));

    const resetUnitsForPlayer = (units: ScenarioUnit[], player: PlayerNumber): ScenarioUnit[] =>
      units.map(unit => {
        const status = unit.status || 'available';
        if (unit.player === player) {
          if (status === 'moved' || status === 'selected') {
            return { ...unit, status: 'available' as UnitStatus };
          }
        } else if (status === 'selected') {
          return { ...unit, status: 'available' as UnitStatus };
        }
        return unit;
      });

    // Handle different event types
    let updatedGameState: GameState;
    
    if (eventType === 'mapClick') {
      // Validate hex coordinates for mapClick
      if (!hex || typeof hex.row !== 'number' || typeof hex.column !== 'number') {
        return createErrorResponse(400, 'Invalid hex coordinates. Expected { column: number, row: number }', user);
      }

      const scenarioColumns = game.scenarioSnapshot?.columns;
      const scenarioRows = game.scenarioSnapshot?.rows;

      if (typeof scenarioColumns === 'number' && (hex.column < 0 || hex.column >= scenarioColumns)) {
        return createErrorResponse(400, `Column ${hex.column} is outside the scenario bounds`, user);
      }

      if (typeof scenarioRows === 'number' && (hex.row < 0 || hex.row >= scenarioRows)) {
        return createErrorResponse(400, `Row ${hex.row} is outside the scenario bounds`, user);
      }
      
      const activePlayer = game.gameState.activePlayer ?? PlayerNumber.Player1;
      const currentPhase = game.gameState.phase ?? GamePhase.Movement;
      const currentAction = game.gameState.action ?? GameAction.SelectUnit;
      const units = cloneUnits(game.gameState.units);

      if (currentPhase === GamePhase.Movement && currentAction === GameAction.SelectUnit) {
        // In Movement Phase - Select Unit: Auto-select topmost unit on clicked hex
        if (!units || units.length === 0) {
          return createErrorResponse(500, 'Game state is missing unit data', user);
        }

        // Find units at the clicked hex that belong to the active player and are available (exclude moved and selected units)
        const unitsAtHex = units.filter(unit => {
          const status = unit.status || 'available';
          return (
            unit.column === hex.column && 
            unit.row === hex.row &&
            unit.player === activePlayer &&
            status === 'available'
          );
        });

        if (unitsAtHex.length > 0) {
          // Select the last unit found (topmost - units are rendered in order, last one appears on top)
          const unitToSelect = unitsAtHex[unitsAtHex.length - 1];
          
          const updatedUnits = units.map(unit => {
            if (unit.id === unitToSelect.id) {
              return { ...unit, status: 'selected' as UnitStatus };
            }

            // Clear selection from other units of the same player
            if (unit.player === activePlayer && unit.status === 'selected') {
              return { ...unit, status: 'available' as UnitStatus };
            }

            return unit;
          });

          updatedGameState = {
            ...game.gameState,
            units: updatedUnits,
            phase: currentPhase,
            action: GameAction.SelectDestinationHex,
            selectedUnitId: unitToSelect.id,
            selectedHex: { column: hex.column, row: hex.row },
          };
        } else {
          // No unit at this hex - just update selected hex
          updatedGameState = {
            ...game.gameState,
            selectedHex: { column: hex.column, row: hex.row }
          };
        }
      } else if (currentPhase === GamePhase.Movement && currentAction === GameAction.SelectDestinationHex) {
        const selectedUnitId = game.gameState.selectedUnitId;
        if (!selectedUnitId) {
          return createErrorResponse(400, 'No unit selected for movement', user);
        }

        if (!units || units.length === 0) {
          return createErrorResponse(500, 'Game state is missing unit data', user);
        }

        const unitIndex = units.findIndex(u => u.id === selectedUnitId);
        if (unitIndex === -1) {
          return createErrorResponse(404, `Selected unit ${selectedUnitId} was not found`, user);
        }

        const selectedUnit = units[unitIndex];
        if (selectedUnit.player !== activePlayer) {
          return createErrorResponse(403, 'You cannot move an opponent\'s unit', user);
        }

        // Validate that the destination hex is within movement range
        const scenarioColumns = game.scenarioSnapshot?.columns;
        const scenarioRows = game.scenarioSnapshot?.rows;
        const scenarioHexes = game.scenarioSnapshot?.hexes || [];
        
        if (typeof scenarioColumns !== 'number' || typeof scenarioRows !== 'number') {
          return createErrorResponse(500, 'Scenario dimensions are missing', user);
        }

        // Calculate movement range for the selected unit
        console.log('[events/route] Validating movement:', {
          unitId: selectedUnitId,
          fromColumn: selectedUnit.column,
          fromRow: selectedUnit.row,
          toColumn: hex.column,
          toRow: hex.row,
          movementAllowance: selectedUnit.movementAllowance,
          unitArm: selectedUnit.arm
        });
        
        const movementRange = calculateMovementRange(
          selectedUnit.column,
          selectedUnit.row,
          selectedUnit.movementAllowance,
          scenarioHexes.map(h => ({
            column: h.column,
            row: h.row,
            terrain: h.terrain as TerrainType,
            rivers: h.rivers ?? 0,
            roads: h.roads ?? 0
          })),
          scenarioColumns,
          scenarioRows,
          units,
          activePlayer,
          selectedUnit.arm
        );

        // Check if the destination hex is in the movement range
        const destinationKey = `${hex.column},${hex.row}`;
        const movementCost = movementRange[destinationKey];
        
        console.log('[events/route] Movement validation result:', {
          destinationKey,
          movementCost,
          inRange: movementCost !== undefined,
          rangeSize: Object.keys(movementRange).length,
          sampleRangeKeys: Object.keys(movementRange).slice(0, 10)
        });
        
        if (movementCost === undefined) {
          return createErrorResponse(400, `Destination hex (${hex.column}, ${hex.row}) is not within movement range. Movement allowance: ${selectedUnit.movementAllowance}`, user);
        }

        // Additional validation: ensure the destination is not enemy-occupied
        const destinationUnits = units.filter(u => u.column === hex.column && u.row === hex.row);
        const hasEnemyUnit = destinationUnits.some(u => u.player !== activePlayer);
        if (hasEnemyUnit) {
          return createErrorResponse(400, 'Cannot move to a hex occupied by an enemy unit', user);
        }

        // Additional validation: ensure the destination is not water
        const destinationHex = scenarioHexes.find(h => h.column === hex.column && h.row === hex.row);
        if (destinationHex && (destinationHex.terrain as TerrainType) === TerrainType.Water) {
          return createErrorResponse(400, 'Cannot move to a water hex', user);
        }

        const updatedUnits = units.map(unit => {
          if (unit.id === selectedUnitId) {
            return {
              ...unit,
              column: hex.column,
              row: hex.row,
              status: 'moved' as UnitStatus,
            };
          }

          if (unit.player === activePlayer && unit.status === 'selected') {
            return { ...unit, status: 'available' as UnitStatus };
          }

          return unit;
        });

        updatedGameState = {
          ...game.gameState,
          units: updatedUnits,
          selectedUnitId: undefined,
          selectedHex: { column: hex.column, row: hex.row },
          action: GameAction.SelectUnit,
        };
      } else {
        // Default behaviour: update selected hex without altering units
        updatedGameState = {
          ...game.gameState,
          selectedHex: { column: hex.column, row: hex.row }
        };
      }
    } else if (eventType === 'selectUnit') {
      const { unitId } = body;
      if (!unitId || typeof unitId !== 'string') {
        return createErrorResponse(400, 'unitId is required for selectUnit events', user);
      }

      const activePlayer = game.gameState.activePlayer ?? PlayerNumber.Player1;
      const currentPhase = game.gameState.phase ?? GamePhase.Movement;
      const currentAction = game.gameState.action ?? GameAction.SelectUnit;
      const units = cloneUnits(game.gameState.units);

      if (currentPhase !== GamePhase.Movement) {
        return createErrorResponse(400, 'Units can only be selected during the Movement phase', user);
      }

      if (!units || units.length === 0) {
        return createErrorResponse(500, 'Game state is missing unit data', user);
      }

      const unitIndex = units.findIndex(u => u.id === unitId);
      if (unitIndex === -1) {
        return createErrorResponse(404, `Unit ${unitId} was not found`, user);
      }

      const unitToSelect = units[unitIndex];
      if (unitToSelect.player !== activePlayer) {
        return createErrorResponse(403, 'You can only select your own units', user);
      }

      const unitStatus = unitToSelect.status || 'available';
      
      // If unit is moved, return it to starting location and make it available
      if (unitStatus === 'moved') {
        const startingColumn = unitToSelect.startingColumn ?? unitToSelect.column;
        const startingRow = unitToSelect.startingRow ?? unitToSelect.row;
        
        const updatedUnits = units.map(unit => {
          if (unit.id === unitId) {
            return { 
              ...unit, 
              column: startingColumn,
              row: startingRow,
              status: 'available' as UnitStatus 
            };
          }

          if (unit.player === activePlayer && unit.status === 'selected') {
            return { ...unit, status: 'available' as UnitStatus };
          }

          return unit;
        });

        updatedGameState = {
          ...game.gameState,
          units: updatedUnits,
          phase: currentPhase,
          action: currentAction,
          selectedHex: { column: startingColumn, row: startingRow },
          selectedUnitId: undefined, // Don't select the unit, just return it
        };
      } else {
        // Normal selection for available units
        const updatedUnits = units.map(unit => {
          if (unit.id === unitId) {
            return { ...unit, status: 'selected' as UnitStatus };
          }

          if (unit.player === activePlayer && unit.status === 'selected') {
            return { ...unit, status: 'available' as UnitStatus };
          }

          return unit;
        });

        updatedGameState = {
          ...game.gameState,
          units: updatedUnits,
          phase: currentPhase,
          action: GameAction.SelectDestinationHex,
          selectedUnitId: unitId,
          selectedHex: { column: unitToSelect.column, row: unitToSelect.row },
        };
      }
    } else if (eventType === 'endPhase') {
      const activePlayer = game.gameState.activePlayer ?? PlayerNumber.Player1;
      const currentPhase = game.gameState.phase ?? GamePhase.Movement;
      const currentAction = game.gameState.action ?? GameAction.SelectUnit;
      const units = cloneUnits(game.gameState.units);
      
      // Verify it's the active player's turn
      const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : PlayerNumber.Player2;
      console.log('[events/route] endPhase event:', {
        gameId,
        userId,
        isPlayer1,
        isPlayer2,
        currentPlayer,
        activePlayer,
        currentPhase,
        turnNumber: game.gameState.turnNumber
      });
      
      if (activePlayer !== currentPlayer) {
        console.log('[events/route] endPhase: Turn validation failed', {
          activePlayer,
          currentPlayer
        });
        return createErrorResponse(403, `It's not your turn. Active player is ${activePlayer}`, user);
      }
      
      if (currentPhase === GamePhase.Movement) {
        // Movement Phase ends -> Move to Combat Phase (SelectTarget action)
        // Set all units to available status and record starting locations for Combat Phase
        const clearedUnits = units.map(unit => ({ 
          ...unit, 
          status: 'available' as UnitStatus,
          startingColumn: unit.column,
          startingRow: unit.row
        }));

        updatedGameState = {
          ...game.gameState,
          units: clearedUnits,
          phase: GamePhase.Combat,
          action: GameAction.SelectTarget,
          selectedHex: undefined,
          selectedUnitId: undefined,
        };
      } else if (currentPhase === GamePhase.Combat) {
        if (activePlayer === PlayerNumber.Player1) {
          // Player 1 ends Combat Phase -> Pass to Player 2 (same turn, Movement Phase)
          // Only set active player's (Player 2) units to available, record starting locations
          const newActivePlayer = PlayerNumber.Player2;
          const resetUnits = units.map(unit => {
            const updatedUnit = {
              ...unit,
              startingColumn: unit.column,
              startingRow: unit.row
            };
            
            if (unit.player === newActivePlayer) {
              // Active player's units: set to available
              return { ...updatedUnit, status: 'available' as UnitStatus };
            } else {
              // Inactive player's units: set to unavailable
              return { ...updatedUnit, status: 'unavailable' as UnitStatus };
            }
          });

          updatedGameState = {
            ...game.gameState,
            units: resetUnits,
            activePlayer: newActivePlayer,
            phase: GamePhase.Movement,
            action: GameAction.SelectUnit,
            selectedHex: undefined,
            selectedUnitId: undefined,
          };
        } else {
          // Player 2 ends Combat Phase -> Increment turn, pass to Player 1, reset to Movement Phase
          // Only set active player's (Player 1) units to available, record starting locations
          const newActivePlayer = PlayerNumber.Player1;
          const newTurnNumber = (game.gameState.turnNumber ?? 1) + 1;
          console.log('[events/route] Player 2 ending Combat Phase:', {
            oldTurnNumber: game.gameState.turnNumber,
            newTurnNumber,
            newActivePlayer
          });
          
          const resetUnits = units.map(unit => {
            const updatedUnit = {
              ...unit,
              startingColumn: unit.column,
              startingRow: unit.row
            };
            
            if (unit.player === newActivePlayer) {
              // Active player's units: set to available
              return { ...updatedUnit, status: 'available' as UnitStatus };
            } else {
              // Inactive player's units: set to unavailable
              return { ...updatedUnit, status: 'unavailable' as UnitStatus };
            }
          });

          updatedGameState = {
            ...game.gameState,
            units: resetUnits,
            turnNumber: newTurnNumber,
            activePlayer: newActivePlayer,
            phase: GamePhase.Movement,
            action: GameAction.SelectUnit,
            selectedHex: undefined,
            selectedUnitId: undefined,
          };
          
          console.log('[events/route] Updated game state for Player 2 endPhase:', {
            turnNumber: updatedGameState.turnNumber,
            activePlayer: updatedGameState.activePlayer,
            phase: updatedGameState.phase,
            action: updatedGameState.action
          });
        }
      } else {
        // Unknown phase - default to Movement Phase
        // Only set active player's units to available, record starting locations
        const currentActivePlayer = game.gameState.activePlayer ?? PlayerNumber.Player1;
        const resetUnits = units.map(unit => {
          const updatedUnit = {
            ...unit,
            startingColumn: unit.column,
            startingRow: unit.row
          };
          
          if (unit.player === currentActivePlayer) {
            // Active player's units: set to available
            return { ...updatedUnit, status: 'available' as UnitStatus };
          } else {
            // Inactive player's units: set to unavailable
            return { ...updatedUnit, status: 'unavailable' as UnitStatus };
          }
        });

        updatedGameState = {
          ...game.gameState,
          units: resetUnits,
          phase: GamePhase.Movement,
          action: GameAction.SelectUnit,
          selectedHex: undefined,
          selectedUnitId: undefined,
        };
      }
    } else {
      return createErrorResponse(400, `Unhandled event type: ${eventType}`, user);
    }

    const updatedGame: Game = {
      ...game,
      gameState: updatedGameState,
      updatedAt: new Date().toISOString()
    };

    // Save updated game state
    await saveGame(updatedGame);

    // Broadcast updated game state to all connected clients
    // Create filtered game state without scenarioSnapshot to minimize payload
    const { scenarioSnapshot, scenarioId, ...gameStateWithoutSnapshot } = updatedGame;
    
    const broadcastMessage = {
      type: 'gameStateUpdate',
      gameId,
      action: eventType,
      gameState: gameStateWithoutSnapshot,
      timestamp: new Date().toISOString()
    };

    console.log('[events/route] Broadcasting game state update:', {
      gameId,
      action: eventType,
      connectionsTable: process.env.CONNECTIONS_TABLE,
      websocketEndpoint: process.env.WEBSOCKET_ENDPOINT ? 'set' : 'not set'
    });
    
    const broadcastResult = await broadcastToGame(gameId, broadcastMessage);
    console.log('[events/route] Broadcast result:', broadcastResult);

    const response = { 
      gameId, 
      game: updatedGame,
      message: 'Game event processed and broadcast',
      broadcastResult
    };
    
    return createSuccessResponse(200, response, user);
  } catch (error) {
    console.error('Error processing game event:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

