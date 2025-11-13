"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import HexGrid from "@/components/HexGrid";
import { useGameWebSocket } from "@/components/GameWebSocket";
import {
  getGame,
} from "@/lib/game-api";
import {
  getScenario,
  type Scenario,
} from "@/lib/scenario-api";
import { useAuth } from "@/lib/auth-client";
import type { Game, ScenarioUnit, UnitStatus } from "@/shared/types";
import { getGameStatus, PlayerNumber, TerrainType, GamePhase, GameAction } from "@/shared/types";
import { calculateMovementRange, type MovementRange } from "@/lib/hex-pathfinding";

// Unit symbol preview component (reused from EditorClient)
function UnitSymbolPreview({ unit, size }: { unit: ScenarioUnit; size?: number }) {
  // Use provided size or calculate from hex dimensions to match map
  // If size is provided, it's the actual unit size (hexWidth * 0.72 * 0.85)
  // If not provided, use default preview size for edit form
  const hexSize = 28;
  const hexWidth = hexSize * 2;
  
  let previewSize: number;
  let unitSize: number;
  
  if (size) {
    // Size is provided - use it directly as unit size
    // For SVG viewBox, add extra space for border (2px border = 4px total)
    unitSize = size;
    previewSize = size + 4; // unit size + border space (4px for 2px border on each side)
  } else {
    // Default preview size for edit form
    previewSize = 80;
    const baseUnitSize = previewSize * 0.72;
    unitSize = baseUnitSize * 0.85;
  }
  
  const unitWidth = unitSize; // Square width
  const unitHeight = unitSize; // Square height
  const color = unit.player === 1 ? "#3b82f6" : "#dc2626";
  
  // Arm symbol: rectangle centered horizontally, positioned above the text
  const baseArmSymbolWidth = unitWidth * 0.4; // Base width of rectangle
  const baseArmSymbolHeight = unitHeight * 0.25; // Base height to avoid fonts
  // Grow by 50% while keeping bottom position fixed
  const armSymbolWidth = baseArmSymbolWidth * 1.5; // 50% larger
  const armSymbolHeight = baseArmSymbolHeight * 1.5; // 50% larger
  const fontSize = unitHeight * 0.4; // Bigger font size - calculate first
  const textY = unitHeight / 2 - fontSize * 0.4 - unitHeight * 0.05; // Text position at bottom, moved up slightly
  const marginFromBorder = unitHeight * 0.05; // Margin from unit border
  const marginFromText = unitHeight * 0.15; // Increased margin from text to avoid touching
  // Calculate original bottom position, then adjust Y to keep bottom fixed
  const originalBottomY = textY - baseArmSymbolHeight - marginFromText - (baseArmSymbolHeight / 2) + baseArmSymbolHeight;
  const armSymbolX = -armSymbolWidth / 2; // Centered horizontally
  const armSymbolY = originalBottomY - armSymbolHeight - unitHeight * 0.05; // Keep bottom position fixed, moved up slightly
  
  // Arm symbol coordinates
  const symbolInset = Math.min(armSymbolWidth, armSymbolHeight) * 0.2;
  const symbolTop = armSymbolY + symbolInset;
  const symbolBottom = armSymbolY + armSymbolHeight - symbolInset;
  const symbolLeft = armSymbolX + symbolInset;
  const symbolRight = armSymbolX + armSymbolWidth - symbolInset;

  // Determine border, text, and arm symbol color based on status
  const status = unit.status || 'available';
  let borderColor = "#fff"; // available - white border
  let textColor = "#fff"; // available - white text
  let armSymbolColor = "#fff"; // available - white arm symbol
  if (status === 'selected') {
    borderColor = "#FFEB3B"; // yellow border
    textColor = "#FFEB3B"; // yellow text
    armSymbolColor = "#FFEB3B"; // yellow arm symbol
  } else if (status === 'moved' || status === 'unavailable') {
    borderColor = "#404040"; // dark gray border
    textColor = "#404040"; // dark gray text
    armSymbolColor = "#404040"; // dark gray arm symbol
  }

  return (
    <div className="flex justify-center items-center" style={{ padding: size ? 0 : '0.5rem 0' }}>
      <svg 
        width={size || previewSize} 
        height={size || previewSize} 
        viewBox={`${-previewSize/2} ${-previewSize/2} ${previewSize} ${previewSize}`}
        style={{ display: 'block' }}
      >
        {/* Background for visibility (only in edit form, not in strip) */}
        {!size && (
          <rect
            x={-previewSize/2}
            y={-previewSize/2}
            width={previewSize}
            height={previewSize}
            fill="#f9fafb"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        )}
        {/* Main rectangle with rounded corners */}
        <rect
          x={-unitWidth / 2}
          y={-unitHeight / 2}
          width={unitWidth}
          height={unitHeight}
          rx={unitSize * 0.15}
          ry={unitSize * 0.15}
          fill={color}
          stroke={borderColor}
          strokeWidth={status === 'selected' ? "2" : "1"}
        />
        
        {/* Arm symbol rectangle */}
        <rect
          x={armSymbolX}
          y={armSymbolY}
          width={armSymbolWidth}
          height={armSymbolHeight}
          fill="none"
          stroke={armSymbolColor}
          strokeWidth="1.5"
        />
        
        {/* Arm-specific symbols */}
        {unit.arm === "Infantry" && (
          <>
            <line
              x1={symbolLeft}
              y1={symbolTop}
              x2={symbolRight}
              y2={symbolBottom}
              stroke={armSymbolColor}
              strokeWidth="2"
            />
            <line
              x1={symbolRight}
              y1={symbolTop}
              x2={symbolLeft}
              y2={symbolBottom}
              stroke={armSymbolColor}
              strokeWidth="2"
            />
          </>
        )}
        {unit.arm === "Cavalry" && (
          <line
            x1={symbolLeft}
            y1={symbolTop}
            x2={symbolRight}
            y2={symbolBottom}
            stroke={armSymbolColor}
            strokeWidth="2"
          />
        )}
        {unit.arm === "Artillery" && (
          <circle
            cx={armSymbolX + armSymbolWidth / 2}
            cy={armSymbolY + armSymbolHeight / 2}
            r={Math.min(armSymbolWidth, armSymbolHeight) * 0.25}
            fill={armSymbolColor}
            stroke={armSymbolColor}
            strokeWidth="1"
          />
        )}
        
        {/* Combat strength and movement allowance */}
        <text
          x="0"
          y={textY}
          fill={textColor}
          fontSize={fontSize}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {unit.combatStrength}-{unit.movementAllowance}
        </text>
      </svg>
    </div>
  );
}

// Component to display units in a horizontal scrollable strip
function UnitStrip({ 
  units, 
  hexLabel, 
  onUnitClick 
}: { 
  units: ScenarioUnit[]; 
  hexLabel: string;
  onUnitClick?: (unit: ScenarioUnit) => void;
}) {
  // Calculate unit size to match the map: hexWidth * 0.72 * 0.85
  // hexWidth = hexSize * 2 = 28 * 2 = 56
  // unitSize = 56 * 0.72 * 0.85 = 34.272
  const hexSize = 28;
  const hexWidth = hexSize * 2;
  const unitSize = hexWidth * 0.72 * 0.85; // Same calculation as in HexGrid
  const maxBorderWidth = 2; // Selected units have 2px border
  const containerSize = unitSize + (maxBorderWidth * 2); // border on both sides
  // Halve the spacing by reducing container width by half the border width
  const reducedContainerSize = containerSize - maxBorderWidth;

  return (
    <div>
      <div className="bg-gray-300" style={{ padding: 0, minHeight: `${containerSize}px` }}>
        <div className="overflow-x-auto overflow-y-visible scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100" style={{ padding: 0 }}>
          <div className="flex" style={{ minWidth: 'min-content', gap: 0, padding: 0, margin: 0, minHeight: `${containerSize}px` }}>
            {units.map((unit) => {
              return (
                <div
                  key={unit.id}
                  className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                  style={{ 
                    width: `${reducedContainerSize}px`, 
                    height: `${containerSize}px`,
                    margin: 0,
                    padding: 0
                  }}
                  onClick={() => onUnitClick?.(unit)}
                >
                  <UnitSymbolPreview unit={unit} size={unitSize} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameClient({ params }: { params?: Promise<{ gameId: string }> }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(false);
  const [isProcessingEvent, setIsProcessingEvent] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [gameIdFromRoute, setGameIdFromRoute] = useState<string | null>(null);

  const [hexes, setHexes] = useState<
    Array<{ column: number; row: number; terrain: TerrainType; rivers: number; roads: number }>
  >([]);
  const [units, setUnits] = useState<ScenarioUnit[]>([]);
  const [hoveredHex, setHoveredHex] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [selectedHex, setSelectedHex] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<ScenarioUnit | null>(null);
  const [movementRange, setMovementRange] = useState<MovementRange | undefined>(undefined);
  const [shouldConnectWebSocket, setShouldConnectWebSocket] = useState(false);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement>(null);
  const processingEventRef = useRef<string | null>(null); // Track which event is being processed to prevent duplicates

  // ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  // Define showMessage first (no dependencies)
  const showMessage = useCallback((text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  // WebSocket hook - handles all WebSocket connection and chat logic
  // Only connect when shouldConnectWebSocket is true (i.e., when visiting via shared link)
  const {
    chatMessages,
    chatInput,
    setChatInput,
    connectionStatus,
    isConnected,
    playerConnections,
    sendChatMessage,
    sendGameEvent,
    addSystemMessage,
    wsConnection,
  } = useGameWebSocket({
    gameId: shouldConnectWebSocket ? (currentGame?.gameId || null) : null,
    currentGame: shouldConnectWebSocket ? currentGame : null,
    onMessage: (message) => {
      // Handle game state updates from WebSocket
      // Note: The game state payload is printed to chat in the WebSocket hook
      // This callback updates the local game state when broadcasts are received
      if (message.type === 'gameStateUpdate') {
        console.log('Game state update received:', message);
        console.log('[GameClient] Message structure:', {
          hasGameState: !!message.gameState,
          hasCurrentGame: !!currentGame,
          gameStateStructure: message.gameState ? {
            hasGameState: !!message.gameState.gameState,
            hasSelectedHex: !!message.gameState.gameState?.selectedHex,
            selectedHex: message.gameState.gameState?.selectedHex
          } : null
        });
        
        // WebSocket update is the source of truth - completely override any optimistic/local changes
        // message.gameState contains the full game object (without scenarioSnapshot)
        if (message.gameState) {
          // If we have currentGame, merge with it to preserve scenarioSnapshot
          // Otherwise, use the broadcast game state directly
          const updatedGame = currentGame ? {
            ...currentGame,
            gameState: message.gameState.gameState, // The nested gameState object - this is the source of truth
            updatedAt: message.gameState.updatedAt
          } : {
            ...message.gameState,
            // If currentGame is null, we can't preserve scenarioSnapshot, but that's okay
            // The game will be reloaded if needed
          };
          
          // WebSocket state is the source of truth - completely replace local state
          console.log('[GameClient] WebSocket update received - overriding all local state (source of truth)');
          setCurrentGame(updatedGame);
          setIsProcessingEvent(false); // Clear loading state when game state is updated
          
          // Always update all derived state from WebSocket (source of truth)
          // This overrides any optimistic updates
          const serverGameState = updatedGame.gameState;
          
          // Update units state from server (source of truth - completely replace)
          if (serverGameState.units) {
            setUnits([...serverGameState.units]); // Create new array to ensure React detects change
          } else {
            setUnits([]);
          }
          
          // Update selected unit from server (source of truth)
          if (serverGameState.selectedUnitId) {
            const selectedUnit = serverGameState.units?.find((u: ScenarioUnit) => u.id === serverGameState.selectedUnitId) || null;
            setSelectedUnit(selectedUnit);
          } else {
            setSelectedUnit(null);
          }
          
          // Update selected hex from server (source of truth)
          if (serverGameState.selectedHex) {
            setSelectedHex({ ...serverGameState.selectedHex }); // Create new object to ensure React detects change
          } else {
            setSelectedHex(null);
          }
          
          console.log('[GameClient] State synchronized from WebSocket:', {
            hasSelectedHex: !!serverGameState?.selectedHex,
            selectedHex: serverGameState?.selectedHex,
            selectedUnitId: serverGameState?.selectedUnitId,
            unitsCount: serverGameState?.units?.length || 0,
            phase: serverGameState?.phase,
            action: serverGameState?.action
          });
        } else {
          console.warn('[GameClient] Received gameStateUpdate but message.gameState is missing');
        }
      }
    },
    onError: (error) => {
      showMessage(error, 'error');
    },
  });

  // Auto-scroll chat to top when new messages arrive (newest messages are at top)
  useEffect(() => {
    if (chatMessagesContainerRef.current && chatMessages.length > 0) {
      // Newest messages are at the top (reversed array), so scroll to top (scrollTop = 0)
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (chatMessagesContainerRef.current) {
          chatMessagesContainerRef.current.scrollTop = 0;
        }
      });
    }
  }, [chatMessages]);


  // Define handleLoadGameFromRoute - handles loading game from route params
  const handleLoadGameFromRoute = useCallback(async (gameId: string) => {
    if (!user?.userId) return;
    
    try {
      setLoading(true);
      let game: Game | null = null;
      
      // First, check if user is already a player (minimal fetch to check player status)
      const initialGameResponse = await getGame(gameId);
      const initialGame = initialGameResponse.game;
      
      if (!initialGame) {
        showMessage('Game not found', "error");
        return;
      }

      // Check if user is already a player
      const isPlayer1 = initialGame.player1Id === user.userId;
      const isPlayer2 = initialGame.player2Id === user.userId;
      const isAlreadyPlayer = isPlayer1 || isPlayer2;

      if (!isAlreadyPlayer) {
        // User is not a player - check if they can join
        const gameStatus = getGameStatus(initialGame);
        
        // If game is full, redirect to home with error
        if (gameStatus === 'active' && initialGame.player2) {
          sessionStorage.setItem('gameJoinError', 'This game already has both players. It is not possible to join.');
          router.push('/');
          return;
        }
        
        // If game is waiting, automatically join
        if (gameStatus === 'waiting' && !initialGame.player2) {
          try {
            const { joinGame } = await import('@/lib/game-api');
            // Use the game from join response directly - it includes scenarioSnapshot
            const joinResponse = await joinGame(gameId);
            game = joinResponse.game;
            if (!game) {
              showMessage('Game not found after joining', "error");
              return;
            }
          } catch (error: any) {
            console.error('Error joining game:', error);
            sessionStorage.setItem('gameJoinError', `Failed to join game: ${error.message}`);
            router.push('/');
            return;
          }
        } else {
          // Can't join for some reason
          sessionStorage.setItem('gameJoinError', 'Unable to join this game.');
          router.push('/');
          return;
        }
      } else {
        // User is already a player - use the game we fetched
        game = initialGame;
      }

      // Verify scenario snapshot exists - it's required for the game to function
      // Only fetch if we don't have it (shouldn't happen, but defensive check)
      if (!game.scenarioSnapshot) {
        console.warn('[handleLoadGameFromRoute] Game missing scenarioSnapshot, fetching full game:', game);
        const fullGameResponse = await getGame(gameId);
        game = fullGameResponse.game;
        if (!game || !game.scenarioSnapshot) {
          console.error('[handleLoadGameFromRoute] Game missing scenarioSnapshot after fetch:', game);
          showMessage('Game data is incomplete. The scenario snapshot is missing.', "error");
          return;
        }
      }

      setCurrentGame(game);

      // Use the scenario snapshot from the game (never fetch the original scenario)
      // This ensures the game is not affected by changes to the original scenario
      const scenario = game.scenarioSnapshot;
      setCurrentScenario(scenario);

      // Set hexes from scenario snapshot
      setHexes((scenario.hexes || []).map(hex => ({ 
        ...hex, 
        rivers: hex.rivers ?? 0, 
        roads: hex.roads ?? 0 
      })));

      setSelectedHex(game.gameState.selectedHex ?? null);
      setHoveredHex(null);
      setSelectedUnit(null);

      // Connect WebSocket when loading from route (this is a direct game URL visit)
      setShouldConnectWebSocket(true);
    } catch (error: any) {
      console.error('[handleLoadGameFromRoute] Error loading game:', error);
      showMessage(`Error loading game: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [user?.userId, showMessage, router]);

  // Apply optimistic update for active player
  const applyOptimisticUpdate = useCallback((eventType: string, eventData?: any) => {
    if (!currentGame) return null;

    const isPlayer1 = user?.userId === currentGame.player1Id;
    const isPlayer2 = user?.userId === currentGame.player2Id;
    const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
    const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
    const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;

    // Only apply optimistic updates if it's the active player's turn
    if (!isMyTurn) return null;

    const gameState = currentGame.gameState;
    const phase = gameState.phase ?? GamePhase.Movement;
    const action = gameState.action ?? GameAction.SelectUnit;
    const units = [...(gameState.units || [])];

    if (eventType === 'mapClick' && eventData?.hex) {
      const { hex } = eventData;
      
      if (phase === GamePhase.Movement && action === GameAction.SelectUnit) {
        // Auto-select unit
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
          const unitToSelect = unitsAtHex[unitsAtHex.length - 1];
          const updatedUnits = units.map(unit => {
            if (unit.id === unitToSelect.id) {
              return { ...unit, status: 'selected' as UnitStatus };
            }
            if (unit.player === activePlayer && unit.status === 'selected') {
              return { ...unit, status: 'available' as UnitStatus };
            }
            return unit;
          });

          return {
            ...currentGame,
            gameState: {
              ...gameState,
              units: updatedUnits,
              action: GameAction.SelectDestinationHex,
              selectedUnitId: unitToSelect.id,
              selectedHex: { column: hex.column, row: hex.row },
            },
          };
        } else {
          return {
            ...currentGame,
            gameState: {
              ...gameState,
              selectedHex: { column: hex.column, row: hex.row },
            },
          };
        }
      } else if (phase === GamePhase.Movement && action === GameAction.SelectDestinationHex && gameState.selectedUnitId) {
        // Move unit
        const selectedUnitId = gameState.selectedUnitId;
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

        return {
          ...currentGame,
          gameState: {
            ...gameState,
            units: updatedUnits,
            selectedUnitId: undefined,
            selectedHex: { column: hex.column, row: hex.row },
            action: GameAction.SelectUnit,
          },
        };
      } else {
        return {
          ...currentGame,
          gameState: {
            ...gameState,
            selectedHex: { column: hex.column, row: hex.row },
          },
        };
      }
    } else if (eventType === 'selectUnit' && eventData?.unitId) {
      const { unitId } = eventData;
      const unit = units.find(u => u.id === unitId);
      if (!unit || unit.player !== activePlayer) return null;

      const unitStatus = unit.status || 'available';
      
      if (unitStatus === 'moved') {
        // Return to starting position
        const startingColumn = unit.startingColumn ?? unit.column;
        const startingRow = unit.startingRow ?? unit.row;
        const updatedUnits = units.map(u => {
          if (u.id === unitId) {
            return {
              ...u,
              column: startingColumn,
              row: startingRow,
              status: 'available' as UnitStatus,
            };
          }
          if (u.player === activePlayer && u.status === 'selected') {
            return { ...u, status: 'available' as UnitStatus };
          }
          return u;
        });

        return {
          ...currentGame,
          gameState: {
            ...gameState,
            units: updatedUnits,
            selectedHex: { column: startingColumn, row: startingRow },
            selectedUnitId: undefined,
          },
        };
      } else {
        // Select unit
        const updatedUnits = units.map(u => {
          if (u.id === unitId) {
            return { ...u, status: 'selected' as UnitStatus };
          }
          if (u.player === activePlayer && u.status === 'selected') {
            return { ...u, status: 'available' as UnitStatus };
          }
          return u;
        });

        return {
          ...currentGame,
          gameState: {
            ...gameState,
            units: updatedUnits,
            action: GameAction.SelectDestinationHex,
            selectedUnitId: unitId,
            selectedHex: { column: unit.column, row: unit.row },
          },
        };
      }
    } else if (eventType === 'endPhase') {
      // End phase logic is complex, skip optimistic update for now
      return null;
    }

    return null;
  }, [currentGame, user?.userId]);

  // Process game events (map clicks, button clicks, etc.)
  const processEvent = useCallback(async (eventType: string, eventData?: any) => {
    if (!currentGame) {
      console.warn('[processEvent] No current game');
      return;
    }

    // Prevent duplicate event processing
    const eventKey = `${eventType}-${JSON.stringify(eventData)}-${currentGame.gameId}`;
    if (processingEventRef.current === eventKey) {
      console.log('[processEvent] Event already being processed, skipping duplicate:', eventKey);
      return;
    }
    processingEventRef.current = eventKey;

    console.log('[processEvent] Processing event:', { eventType, eventData, gameId: currentGame.gameId });

    const isPlayer1 = user?.userId === currentGame.player1Id;
    const isPlayer2 = user?.userId === currentGame.player2Id;
    const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
    const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
    const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;

    // Apply optimistic update for active player (temporary - will be overridden by WebSocket)
    // This provides immediate feedback but WebSocket update is the source of truth
    const optimisticGame = applyOptimisticUpdate(eventType, eventData);
    if (optimisticGame && isMyTurn) {
      console.log('[processEvent] Applying optimistic update (temporary - WebSocket will override)');
      setCurrentGame(optimisticGame);
      // Update local state immediately (temporary - WebSocket will override)
      if (optimisticGame.gameState.selectedHex) {
        setSelectedHex(optimisticGame.gameState.selectedHex);
      }
      if (optimisticGame.gameState.selectedUnitId) {
        const selectedUnit = optimisticGame.gameState.units?.find(u => u.id === optimisticGame.gameState.selectedUnitId);
        setSelectedUnit(selectedUnit || null);
      }
      // Update units state (temporary - WebSocket will override)
      if (optimisticGame.gameState.units) {
        setUnits(optimisticGame.gameState.units);
      }
    }

    // Only show processing indicator for non-active players
    if (!isMyTurn) {
      setIsProcessingEvent(true);
    }

    try {
      // Send event to API endpoint for processing
      const { processGameEvent } = await import('@/lib/game-api');
      console.log('[processEvent] Calling API endpoint...', { eventType, gameId: currentGame.gameId, isMyTurn });
      const result = await processGameEvent(currentGame.gameId, eventType, eventData);
      console.log('[processEvent] API call successful:', result);
      
      // For active player, clear processing immediately after API call succeeds
      // The WebSocket update will confirm/correct the optimistic update
      if (isMyTurn) {
        setIsProcessingEvent(false);
      }
      
      // Clear the processing ref after successful API call
      processingEventRef.current = null;
      
      // The API endpoint will:
      // 1. Process the event and update game state in the lambda
      // 2. Broadcast the updated state via WebSocket
      // 3. All clients (including this one) will receive the broadcast and update their UI
      // 
      // IMPORTANT: The WebSocket update from lambda is the DEFINITIVE state value.
      // It completely overrides any optimistic updates. The lambda-processed state is authoritative.
      // For active player: optimistic update provides immediate feedback, WebSocket update is definitive
      // For non-active player: WebSocket update is the first and only state change
    } catch (error: any) {
      console.error('[processEvent] Error processing event:', error);
      console.error('[processEvent] Error details:', {
        message: error.message,
        stack: error.stack,
        eventType,
        gameId: currentGame.gameId,
        isMyTurn
      });
      showMessage(`Failed to process event: ${error.message}`, 'error');
      setIsProcessingEvent(false);
      processingEventRef.current = null; // Clear the processing ref on error
      
      // Revert optimistic update on error
      if (optimisticGame && isMyTurn) {
        console.log('[processEvent] Reverting optimistic update due to error');
        // Reload game state to revert
        const { getGame } = await import('@/lib/game-api');
        try {
          const gameResponse = await getGame(currentGame.gameId);
          if (gameResponse?.game) {
            setCurrentGame(gameResponse.game);
          }
        } catch (reloadError) {
          console.error('[processEvent] Error reloading game after error:', reloadError);
        }
      }
    }
  }, [currentGame, user?.userId, showMessage, applyOptimisticUpdate]);

  const handleSelectUnit = useCallback((unit: ScenarioUnit | null) => {
    if (!currentGame || !unit) {
      return;
    }

    // Don't process unit selection while an event is being processed
    if (isProcessingEvent) {
      return;
    }

    const isPlayer1 = user?.userId === currentGame.player1Id;
    const isPlayer2 = user?.userId === currentGame.player2Id;
    const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
    const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
    const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;

    if (!isMyTurn) {
      const activePlayerName = activePlayer === PlayerNumber.Player1
        ? currentGame.player1.name
        : currentGame.player2?.name || 'Player 2';
      showMessage(`It's ${activePlayerName}'s turn. Please wait for your turn.`, 'error');
      return;
    }

    const currentPhase = currentGame.gameState.phase ?? GamePhase.Movement;
    if (currentPhase !== GamePhase.Movement) {
      showMessage('Units can only be selected during the Movement phase.', 'error');
      return;
    }

    if (unit.player !== activePlayer) {
      showMessage("You can only select your own units.", 'error');
      return;
    }

    // Allow selecting moved units - they will be returned to starting position by the server
    const unitStatus = unit.status || 'available';
    if (unitStatus === 'moved') {
      // For moved units, set selected hex to starting position (or current if starting not available)
      const startingColumn = unit.startingColumn ?? unit.column;
      const startingRow = unit.startingRow ?? unit.row;
      setSelectedHex({ column: startingColumn, row: startingRow });
      setSelectedUnit(null); // Don't set selected unit, it will be returned to starting position
    } else {
      setSelectedHex({ column: unit.column, row: unit.row });
      setSelectedUnit(unit);
    }

    void processEvent('selectUnit', { unitId: unit.id });
  }, [currentGame, user?.userId, showMessage, processEvent, isProcessingEvent]);

  // ALL useEffect HOOKS MUST COME AFTER ALL useCallback HOOKS
  // Synchronize units and selected unit with the latest game state
  useEffect(() => {
    if (!currentGame) {
      setUnits([]);
      setSelectedUnit(null);
      return;
    }

    const stateUnits = currentGame.gameState.units && currentGame.gameState.units.length > 0
      ? currentGame.gameState.units.map(unit => ({ ...unit }))
      : (currentGame.scenarioSnapshot.units || []).map(unit => ({
          ...unit,
          status: (unit.status || 'available') as UnitStatus,
        }));

    setUnits(stateUnits);

    const selectedUnitId = currentGame.gameState.selectedUnitId;
    if (selectedUnitId) {
      const unitInState = stateUnits.find(unit => unit.id === selectedUnitId) || null;
      setSelectedUnit(unitInState || null);
    } else {
      setSelectedUnit(null);
    }
  }, [currentGame]);

  // Calculate movement range when a unit is selected for movement
  useEffect(() => {
    if (
      selectedUnit &&
      currentGame &&
      currentGame.gameState.phase === GamePhase.Movement &&
      currentGame.gameState.action === GameAction.SelectDestinationHex &&
      currentScenario
    ) {
      const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
      console.log('[GameClient] Calculating movement range:', {
        unitColumn: selectedUnit.column,
        unitRow: selectedUnit.row,
        movementAllowance: selectedUnit.movementAllowance,
        activePlayer,
        unitArm: selectedUnit.arm,
        hexesCount: hexes.length,
        unitsCount: units.length
      });
      const range = calculateMovementRange(
        selectedUnit.column,
        selectedUnit.row,
        selectedUnit.movementAllowance,
        hexes,
        currentScenario.columns,
        currentScenario.rows,
        units,
        activePlayer,
        selectedUnit.arm
      );
      const rangeKeys = Object.keys(range);
      console.log('[GameClient] Movement range calculated:', {
        rangeSize: rangeKeys.length,
        rangeKeys: rangeKeys,
        range: range,
        includesHex7_8: range['7,8'] !== undefined,
        hex7_8Cost: range['7,8']
      });
      setMovementRange(range);
    } else {
      setMovementRange(undefined);
    }
  }, [selectedUnit, currentGame, currentScenario, hexes, units]);

  // Redirect to home page if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (typeof window !== "undefined") {
        // Preserve the full path including gameId for redirect after login
        const currentPath = window.location.pathname + window.location.search + window.location.hash;
        sessionStorage.setItem("authRedirect", currentPath);
      }
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Extract gameId from route params
  useEffect(() => {
    if (params) {
      params.then((p) => {
        setGameIdFromRoute(p.gameId);
      });
    }
  }, [params]);

  // Load game from route params
  useEffect(() => {
    if (gameIdFromRoute && isAuthenticated && !currentGame) {
      void handleLoadGameFromRoute(gameIdFromRoute);
    }
  }, [gameIdFromRoute, isAuthenticated, currentGame, handleLoadGameFromRoute]);

  // Show loading state while checking authentication or redirecting
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen min-w-full bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isLoading
              ? "Checking authentication..."
              : "Redirecting to login..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen min-w-full bg-slate-100 flex flex-col overflow-hidden">
      <Header title="Game" />
      <div className="flex flex-1 mt-14 px-6 py-6 gap-6 items-stretch overflow-hidden">
        {/* Control Panel */}
        <aside className="w-[360px] min-w-[360px] flex-shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-0 text-gray-800 shadow-sm">
          {/* End Phase Button - Only visible when a game is selected */}
          {currentGame && currentScenario && (() => {
            const isPlayer1 = user?.userId === currentGame.player1Id;
            const isPlayer2 = user?.userId === currentGame.player2Id;
            const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
            // Default to player 1 if activePlayer is missing (for backward compatibility with old games)
            const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
            const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;
            
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    processEvent('endPhase');
                  }}
                  disabled={!isMyTurn || isProcessingEvent}
                  className={`w-full px-4 py-2 text-sm font-medium rounded transition-colors ${
                    isMyTurn && !isProcessingEvent
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  End Phase {!isMyTurn && `(Player ${activePlayer}'s turn)`} {isProcessingEvent && '(Processing...)'}
                </button>
              </section>
            );
          })()}

          {/* Hovered Hex Info - Only visible when a game is selected */}
          {currentGame && currentScenario && (() => {
            const hoveredUnits = hoveredHex ? units.filter((u) => u.row === hoveredHex.row && u.column === hoveredHex.column) : [];
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0" style={{ minHeight: '100px', height: '100px' }}>
                <h3 className="text-sm font-semibold mb-2 text-gray-700">
                  Hovered Hex{hoveredHex ? ` ${hoveredHex.column}-${hoveredHex.row} (${hoveredUnits.length} units)` : ''}
                </h3>
                <div className="text-xs">
                  {hoveredHex ? (
                    <UnitStrip
                      units={hoveredUnits}
                      hexLabel={`${hoveredHex.column}-${hoveredHex.row}`}
                      onUnitClick={handleSelectUnit}
                    />
                  ) : (
                    <p className="text-gray-400 italic">None</p>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Selected Hex Info - Only visible when a game is selected */}
          {currentGame && currentScenario && (() => {
            const selectedUnits = selectedHex ? units.filter((u) => u.row === selectedHex.row && u.column === selectedHex.column) : [];
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0" style={{ minHeight: '100px', height: '100px' }}>
                <h3 className="text-sm font-semibold mb-2 text-gray-700">
                  Selected Hex{selectedHex ? ` ${selectedHex.column}-${selectedHex.row} (${selectedUnits.length} units)` : ''}
                </h3>
                <div className="text-xs">
                  {selectedHex ? (
                    <UnitStrip
                      units={selectedUnits}
                      hexLabel={`${selectedHex.column}-${selectedHex.row}`}
                      onUnitClick={handleSelectUnit}
                    />
                  ) : (
                    <p className="text-gray-400 italic">None</p>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Phase and Action Display - Only visible when a game is selected */}
          {currentGame && currentScenario && (() => {
            const phase = currentGame.gameState.phase ?? GamePhase.Movement;
            const action = currentGame.gameState.action ?? GameAction.SelectUnit;
            
            const phaseDisplay = phase === GamePhase.Movement 
              ? 'Movement'
              : phase === GamePhase.Combat
                ? 'Combat'
                : 'Unknown';
            
            const actionDisplay = action === GameAction.SelectUnit
              ? 'Select Unit'
              : action === GameAction.SelectDestinationHex
                ? 'Select Destination Hex'
                : action === GameAction.SelectTarget
                  ? 'Select Target'
                  : action === GameAction.SelectAttacker
                    ? 'Select Attacker'
                    : 'Unknown';
            
            return (
              <section className="p-4 border-b border-gray-200 flex-shrink-0">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Phase:</span>
                    <span className="text-sm font-semibold text-gray-900">{phaseDisplay}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Action:</span>
                    <span className="text-sm font-semibold text-gray-900">{actionDisplay}</span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Game Info Panel - Fixed size, shown when game is selected */}
          {currentGame && currentScenario && (
            <section className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Game
                </h2>
                <div className="flex gap-2">
                  {getGameStatus(currentGame) === 'waiting' && !currentGame.player2 && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm font-medium rounded transition-colors bg-green-500 hover:bg-green-600 text-white"
                      onClick={async () => {
                        const gameLink = `${window.location.origin}/game/${currentGame.gameId}`;
                        try {
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(gameLink);
                            showMessage("Game link copied to clipboard!", "success");
                          } else {
                            // Fallback for browsers without clipboard API
                            const textArea = document.createElement('textarea');
                            textArea.value = gameLink;
                            textArea.style.position = 'fixed';
                            textArea.style.left = '-999999px';
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            showMessage("Game link copied to clipboard!", "success");
                          }
                        } catch (error) {
                          console.error('Failed to copy link:', error);
                          // Show the link in an alert as fallback
                          alert(`Game link: ${gameLink}\n\nPlease copy this link to share with player 2.`);
                        }
                      }}
                      title="Copy game link to share with player 2"
                    >
                      Share Link
                    </button>
                  )}
                </div>
              </div>

              {message && (
                <div
                  className={`mb-4 p-3 rounded ${
                    message.type === "success"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Game Info</h3>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Game ID:</span> {currentGame.gameId}</p>
                    <p><span className="font-medium">Status:</span> {getGameStatus(currentGame)}</p>
                    <p><span className="font-medium">Turn:</span> {currentGame.gameState.turnNumber}</p>
                    <p><span className="font-medium">Active Player:</span> {
                      currentGame.gameState.activePlayer === PlayerNumber.Player1 
                        ? `Player 1 (${currentGame.player1.name})`
                        : currentGame.player2 
                          ? `Player 2 (${currentGame.player2.name})`
                          : 'Player 2 (Waiting...)'
                    }</p>
                    <p><span className="font-medium">Phase:</span> {
                      (() => {
                        const phase = currentGame.gameState.phase ?? GamePhase.Movement;
                        return phase === GamePhase.Movement 
                          ? 'Movement'
                          : phase === GamePhase.Combat
                            ? 'Combat'
                            : 'Unknown';
                      })()
                    }</p>
                    <p><span className="font-medium">Action:</span> {
                      (() => {
                        const action = currentGame.gameState.action ?? GameAction.SelectUnit;
                        return action === GameAction.SelectUnit
                          ? 'Select Unit'
                          : action === GameAction.SelectDestinationHex
                            ? 'Select Destination Hex'
                            : action === GameAction.SelectTarget
                              ? 'Select Target'
                              : action === GameAction.SelectAttacker
                                ? 'Select Attacker'
                                : 'Unknown';
                      })()
                    }</p>
                    <p><span className="font-medium">Player 1:</span> {currentGame.player1.name}</p>
                    {currentGame.player2 && (
                      <p><span className="font-medium">Player 2:</span> {currentGame.player2.name}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Scenario</h3>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Title:</span> {currentScenario.title}</p>
                    <p><span className="font-medium">Description:</span> {currentScenario.description}</p>
                    <p><span className="font-medium">Size:</span> {currentScenario.columns} × {currentScenario.rows}</p>
                    <p><span className="font-medium">Turns:</span> {currentScenario.turns}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Chat Panel - Expands to fill remaining space, shown when game is selected */}
          {currentGame && currentScenario && (
            <section className="border-b border-gray-200 flex flex-col flex-1 min-h-0">
              {/* Fixed height container for header, input, and controls */}
              <div className="p-4 flex-shrink-0 border-b border-gray-200" style={{ height: '7rem' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800">Chat</h3>
                  {/* Your connection status - explicit status only */}
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                      connectionStatus === 'connected' ? 'bg-green-500' :
                      connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
                      'bg-red-500'
                    }`}></div>
                    <span className="text-xs font-medium text-gray-700 uppercase">
                      {connectionStatus === 'connecting' ? 'Connecting...' :
                       connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                       connectionStatus === 'connected' ? 'Connected' :
                       'Disconnected'}
                    </span>
                  </div>
                </div>
                
                {/* Chat Input - At the top, max 2 lines */}
                <div className="flex gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 text-sm bg-white text-gray-900 resize-none overflow-y-auto border border-gray-300 rounded p-2"
                    rows={2}
                    style={{ 
                      height: '3rem',
                      minHeight: '3rem',
                      maxHeight: '3rem',
                      lineHeight: '1.125rem'
                    }}
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!isConnected || !chatInput.trim()}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors whitespace-nowrap self-start"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* Chat Messages - Expand to fill available space, newest at top, no padding so yellow extends full width */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <div ref={chatMessagesContainerRef} className="w-full bg-yellow-100 overflow-y-auto font-mono" style={{ flex: '1 1 0%', minHeight: 0 }}>
                  <div className="p-2">
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-4">
                        No messages yet. Start chatting!
                      </p>
                    ) : (
                      <div className="space-y-2">
                      {[...chatMessages].reverse().map((msg, index) => {
                        // Determine if message is from Player 1 or Player 2 using userId (sub) - immutable identifier
                        const isPlayer1 = currentGame && msg.userId && msg.userId === currentGame.player1.userId;
                        const isPlayer2 = currentGame && currentGame.player2 && msg.userId && msg.userId === currentGame.player2.userId;
                        const isSystem = msg.isSystem || (!isPlayer1 && !isPlayer2);
                        
                        // Color: Player 1 = blue, Player 2 = red, System = gray
                        const textColor = isPlayer1 ? 'text-blue-600' : isPlayer2 ? 'text-red-600' : 'text-gray-500';
                        
                        // Get sender email: use current user's email if it's their message, otherwise use player name
                        const senderEmail = msg.userId === user?.userId && user
                          ? (user.email || msg.player)
                          : (isPlayer1 ? currentGame?.player1.name : isPlayer2 ? currentGame?.player2?.name : msg.player);
                        
                        return (
                          <div key={`${msg.timestamp.getTime()}-${index}`} className={`text-xs ${isSystem ? 'italic' : ''}`}>
                            <div className={`${textColor} whitespace-pre-wrap`}>
                              {msg.message}
                            </div>
                            {!isSystem && (
                              <div className="mt-1">
                                <span className="text-gray-400 text-xs">
                                  {msg.timestamp.toLocaleTimeString()}
                                </span>
                                <span className={`${textColor} text-xs ml-2`}>
                                  {senderEmail}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </aside>

        {/* Map Panel */}
        <div className="flex-1 flex-shrink min-w-0 bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm relative">
          {isProcessingEvent && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50 pointer-events-none">
              <div className="bg-white rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm font-medium text-gray-700">Processing...</span>
              </div>
            </div>
          )}
          {currentGame && currentScenario ? (
            <HexGrid
              columns={currentScenario.columns}
              rows={currentScenario.rows}
              hexes={hexes}
              units={units}
              selectedHex={selectedHex}
              movementRange={movementRange}
              onHexClick={(column, row) => {
                // Don't process clicks while an event is being processed
                if (isProcessingEvent) {
                  console.log('[onHexClick] Event processing, ignoring click');
                  return;
                }
                
                // Only process clicks if it's the active player's turn
                if (!currentGame) {
                  console.log('[onHexClick] No current game, ignoring click');
                  return;
                }
                
                const isPlayer1 = user?.userId === currentGame.player1Id;
                const isPlayer2 = user?.userId === currentGame.player2Id;
                const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
                const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
                const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;
                
                console.log('[onHexClick] Click check:', {
                  column,
                  row,
                  currentPlayer,
                  activePlayer,
                  isMyTurn,
                  userId: user?.userId
                });
                
                if (!isMyTurn) {
                  // Not the active player's turn - show message and don't process
                  const activePlayerName = activePlayer === PlayerNumber.Player1 
                    ? currentGame.player1.name 
                    : currentGame.player2?.name || 'Player 2';
                  console.log('[onHexClick] Not active player turn, rejecting click');
                  showMessage(`It's ${activePlayerName}'s turn. Please wait for your turn.`, 'error');
                  return; // Early return - don't update state or send event
                }
                
                // It's the active player's turn - process the click
                console.log('[onHexClick] Active player turn, processing click');
                setSelectedHex({ column, row });
                // Process map click event
                processEvent('mapClick', { hex: { column, row } });
              }}
              onHexHover={(column, row) => {
                if (column !== null && row !== null) {
                  setHoveredHex({ column, row });
                } else {
                  setHoveredHex(null);
                }
              }}
              onHexSelect={(column, row) => {
                // Only process selection if it's the active player's turn
                if (!currentGame) return;
                
                const isPlayer1 = user?.userId === currentGame.player1Id;
                const isPlayer2 = user?.userId === currentGame.player2Id;
                const currentPlayer = isPlayer1 ? PlayerNumber.Player1 : (isPlayer2 ? PlayerNumber.Player2 : null);
                const activePlayer = currentGame.gameState.activePlayer ?? PlayerNumber.Player1;
                const isMyTurn = currentPlayer !== null && activePlayer === currentPlayer;
                
                if (!isMyTurn) {
                  // Not the active player's turn - don't update selection
                  return;
                }
                
                // It's the active player's turn - update selection
                if (column !== null && row !== null) {
                  setSelectedHex({ column, row });
                } else {
                  setSelectedHex(null);
                }
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Select a game to view the map</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

