"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-client";
import { getGame } from "@/lib/game-api";
import type { Game } from "@/shared/types";

// Better Auth client for getting session tokens
const authClient = typeof window !== 'undefined' 
  ? require('better-auth/react').createAuthClient({
      baseURL: window.location.origin,
      basePath: '/api/auth',
    })
  : null;

/**
 * Get access token from Better Auth session (client-side)
 * Returns the Cognito ID token for WebSocket authentication
 * 
 * Note: Better Auth doesn't expose the ID token in the client-side session response
 * for security reasons. We fetch it from the server-side session endpoint.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/docs/session-token');
    if (!response.ok) {
      return null;
    }
    
    const tokenData = await response.json();
    if (!tokenData || !tokenData.token) {
      // WebSocket connection will proceed without token (Lambda validates access via userId)
      console.warn('[getAccessToken] ID token not available in session (this is expected if Better Auth callbacks are not storing tokens)');
      return null;
    }
    
    return tokenData.token;
  } catch (error) {
    console.error('[getAccessToken] Error fetching token:', error);
    return null;
  }
}

export interface ChatMessage {
  player: string;
  userId?: string; // Cognito sub (immutable user ID)
  message: string;
  timestamp: Date;
  isSystem?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface PlayerConnectionStatus {
  player1: boolean; // true if player 1 is connected
  player2: boolean; // true if player 2 is connected
}

interface GameWebSocketProps {
  gameId: string | null;
  currentGame: Game | null;
  onMessage?: (message: any) => void;
  onError?: (error: string) => void;
}

export function useGameWebSocket({ gameId, currentGame, onMessage, onError }: GameWebSocketProps) {
  const { user } = useAuth();
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [playerConnections, setPlayerConnections] = useState<PlayerConnectionStatus>({ player1: false, player2: false });
  const playerConnectionsRef = useRef<PlayerConnectionStatus>({ player1: false, player2: false });
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const connectingRef = useRef(false);
  const lastGameIdRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    playerConnectionsRef.current = playerConnections;
  }, [playerConnections]);

  // Keep refs in sync
  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  }, [onMessage, onError]);

  const addSystemMessage = useCallback((message: string) => {
    setChatMessages(prev => [...prev, {
      player: 'System',
      message: message,
      timestamp: new Date(),
      isSystem: true
    }]);
  }, []);

  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'chat':
        setChatMessages(prev => [...prev, {
          player: message.player || 'Unknown',
          userId: message.userId,
          message: message.message,
          timestamp: new Date()
        }]);
        break;
      case 'connectionStateUpdate':
        // Update player connection status from full connection state
        console.log('[handleWebSocketMessage] Processing connectionStateUpdate:', message);
        if (message.connections) {
          const newState: PlayerConnectionStatus = {
            player1: message.connections.player1?.connected || false,
            player2: message.connections.player2?.connected || false
          };
          
          console.log('[handleWebSocketMessage] New connection state:', newState);
          
          // Build connection state info message for chat
          const player1Status = newState.player1 ? '✓' : '✗';
          const player1Name = message.connections.player1?.playerName || 'Player 1';
          const player2Status = message.connections.player2 
            ? (newState.player2 ? '✓' : '✗')
            : null;
          const player2Name = message.connections.player2?.playerName || 'Player 2';
          
          let connectionInfo = `Connection state: ${player1Status} ${player1Name}`;
          if (message.connections.player2) {
            connectionInfo += `, ${player2Status} ${player2Name}`;
          }
          console.log('[handleWebSocketMessage] Adding connection info message to chat:', connectionInfo);
          addSystemMessage(connectionInfo);
          
          // Only show individual change messages if state actually changed
          // Use ref to get current state without stale closure issues
          const prevState = playerConnectionsRef.current;
          console.log('[handleWebSocketMessage] Previous state:', prevState, 'New state:', newState);
          if (prevState.player1 !== newState.player1) {
            if (newState.player1) {
              addSystemMessage(`✓ ${message.connections.player1?.playerName || 'Player 1'} connected`);
            } else {
              addSystemMessage(`✗ ${message.connections.player1?.playerName || 'Player 1'} disconnected`);
            }
          }
          if (prevState.player2 !== newState.player2 && message.connections.player2) {
            if (newState.player2) {
              addSystemMessage(`✓ ${message.connections.player2?.playerName || 'Player 2'} connected`);
            } else {
              addSystemMessage(`✗ ${message.connections.player2?.playerName || 'Player 2'} disconnected`);
            }
          }
          
          setPlayerConnections(newState);
        } else {
          console.warn('[handleWebSocketMessage] connectionStateUpdate message missing connections:', message);
        }
        break;
      case 'playerJoined':
        // Legacy message type - kept for backward compatibility but connectionStateUpdate is preferred
        addSystemMessage(`✓ ${message.playerName || `Player ${message.playerIndex}`} joined the game`);
        // Update player connection status
        if (message.playerIndex === 1) {
          setPlayerConnections(prev => ({ ...prev, player1: true }));
        } else if (message.playerIndex === 2) {
          setPlayerConnections(prev => ({ ...prev, player2: true }));
        }
        break;
      case 'playerDisconnected':
        // Legacy message type - kept for backward compatibility but connectionStateUpdate is preferred
        addSystemMessage(`✗ ${message.playerName || `Player ${message.playerIndex}`} left the game`);
        // Update player connection status
        if (message.playerIndex === 1) {
          setPlayerConnections(prev => ({ ...prev, player1: false }));
        } else if (message.playerIndex === 2) {
          setPlayerConnections(prev => ({ ...prev, player2: false }));
        }
        break;
      case 'gameStateUpdate':
        // Print game state payload to chat (only broadcast messages appear here)
        if (message.gameState) {
          const gameStateStr = JSON.stringify(message.gameState, null, 2);
          const eventType = message.action || 'gameStateUpdate';
          addSystemMessage(`Game State Payload (${eventType}):\n${gameStateStr}`);
        }
        // Forward game state updates to parent component
        if (onMessageRef.current) {
          onMessageRef.current(message);
        }
        break;
      case 'error':
        const errorMsg = message.message || 'WebSocket error';
        if (onErrorRef.current) {
          onErrorRef.current(errorMsg);
        }
        addSystemMessage(errorMsg);
        break;
      default:
        console.log('Unknown message type:', message);
    }
  }, [addSystemMessage]);

  const connectWebSocket = useCallback(async (gameIdToConnect: string) => {
    // Close existing connection in this tab/component instance only
    // This allows multiple devices/browsers to connect simultaneously
    if (wsConnection) {
      console.log('[WebSocket] Closing existing connection before reconnecting');
      wsConnection.close();
      addSystemMessage('Reconnecting to game...');
    }

    if (!user?.userId) {
      setConnectionStatus('disconnected');
      addSystemMessage('User not authenticated. Please log in again.');
      setIsConnected(false);
      return;
    }

    setConnectionStatus('connecting');
    addSystemMessage(`Connecting to game ${gameIdToConnect.substring(0, 8)}...`);

    // Fetch WebSocket URL from API (runtime configuration, not build-time)
    let wsUrl: string | null = null;
    try {
      const configResponse = await fetch('/api/config');
      if (configResponse.ok) {
        const config = await configResponse.json();
        wsUrl = config.websocketUrl;
      }
    } catch (error) {
      console.error('Error fetching WebSocket URL:', error);
    }
    
    // If WebSocket URL is not configured, show a message and don't attempt connection
    if (!wsUrl || wsUrl.includes('placeholder')) {
      setConnectionStatus('disconnected');
      addSystemMessage('✗ WebSocket not configured. Real-time features are disabled. The WebSocket URL may not be set in the environment. For local development, ensure you have run the deployment script to configure the WebSocket URL.');
      setIsConnected(false);
      connectingRef.current = false;
      return;
    }
    
    try {
      // Get auth token for WebSocket connection from Better Auth session
      // Note: ID token may not be available if Better Auth callbacks aren't storing it
      // For now, we'll connect without the token - the Lambda validates access by checking userId against game players
      const token = await getAccessToken();
      
      // Build WebSocket URL with userId (required) and optional token
      // The Lambda handler validates that userId matches player1Id or player2Id in the game
      let wsUrlWithParams = `${wsUrl}?gameId=${gameIdToConnect}&userId=${encodeURIComponent(user.userId)}`;
      if (token) {
        wsUrlWithParams += `&token=${encodeURIComponent(token)}`;
      }
      
      // Log connection details for debugging
      console.log('[WebSocket] Connecting with:', {
        gameId: gameIdToConnect,
        userId: user.userId,
        userIdLength: user.userId?.length,
        hasToken: !!token,
        wsUrl: wsUrl,
        urlPreview: `${wsUrl}?gameId=${gameIdToConnect}&userId=${user.userId.substring(0, 8)}...`
      });
      
      // Fetch game to compare userIds (even if currentGame is set, fetch fresh to ensure accuracy)
      try {
        const gameResponse = await getGame(gameIdToConnect);
        const game = gameResponse.game;
        console.log('[WebSocket] Game player IDs from server:', {
          player1Id: game.player1Id,
          player2Id: game.player2Id,
          connectingUserId: user.userId,
          matchesPlayer1: game.player1Id === user.userId,
          matchesPlayer2: game.player2Id === user.userId,
          player1IdLength: game.player1Id?.length,
          player2IdLength: game.player2Id?.length,
          userIdLength: user.userId?.length
        });
        
        if (game.player1Id !== user.userId && game.player2Id !== user.userId) {
          console.error('[WebSocket] USER ID MISMATCH DETECTED:', {
            error: 'The userId being sent does not match player1Id or player2Id in the game',
            connectingUserId: user.userId,
            gamePlayer1Id: game.player1Id,
            gamePlayer2Id: game.player2Id,
            suggestion: 'This is likely due to the user ID mismatch issue (Better Auth ID vs Cognito sub)'
          });
        }
      } catch (error) {
        console.error('[WebSocket] Failed to fetch game for comparison:', error);
      }
      
      const ws = new WebSocket(wsUrlWithParams);
      
      ws.onopen = () => {
        console.log('[WebSocket] Connection opened successfully');
        setIsConnected(true);
        setConnectionStatus('connected');
        const playerName = currentGame?.player1.userId === user?.userId 
          ? currentGame.player1.name 
          : (currentGame?.player2?.name || 'Player');
        addSystemMessage(`✓ Connected to game as ${playerName}`);
        connectingRef.current = false; // Reset connecting flag on successful connection
        
        // Mark current player as connected
        if (currentGame) {
          const isPlayer1 = currentGame.player1.userId === user?.userId;
          const isPlayer2 = currentGame.player2?.userId === user?.userId;
          if (isPlayer1) {
            setPlayerConnections(prev => ({ ...prev, player1: true }));
          } else if (isPlayer2) {
            setPlayerConnections(prev => ({ ...prev, player2: true }));
          }
        }
        
        // Send join message
        ws.send(JSON.stringify({
          action: 'join',
          gameId: gameIdToConnect
        }));
        addSystemMessage('Joining game room...');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Received message:', {
            type: message.type,
            gameId: message.gameId,
            player: message.player,
            message: message.message,
            action: message.action,
            fullMessage: message
          });
          // Log connection state updates specifically with more detail
          if (message.type === 'connectionStateUpdate') {
            console.log('[WebSocket] ⚡ CONNECTION STATE UPDATE RECEIVED:', {
              type: message.type,
              gameId: message.gameId,
              connections: message.connections,
              player1: message.connections?.player1,
              player2: message.connections?.player2,
              timestamp: message.timestamp,
              fullMessage: message
            });
          } else if (message.type === 'gameStateUpdate') {
            console.log('[WebSocket] ⚡ GAME STATE UPDATE RECEIVED:', {
              type: message.type,
              gameId: message.gameId,
              action: message.action,
              hasGameState: !!message.gameState,
              timestamp: message.timestamp,
              fullMessage: message
            });
          } else {
            console.log(`[WebSocket] Received message type: ${message.type} (not connectionStateUpdate or gameStateUpdate)`);
          }
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error, 'Raw data:', event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error event:', {
          error,
          readyState: ws.readyState,
          url: ws.url,
          readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]
        });
        setIsConnected(false);
        const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState];
        setConnectionStatus('disconnected');
        addSystemMessage(`✗ Connection error (${readyStateText}). Please check your connection.`);
      };

      ws.onclose = (event) => {
        const codeMeanings: Record<number, string> = {
          1000: 'Normal Closure',
          1001: 'Going Away',
          1002: 'Protocol Error',
          1003: 'Unsupported Data',
          1006: 'Abnormal Closure (no close frame received)',
          1007: 'Invalid Data',
          1008: 'Policy Violation',
          1009: 'Message Too Big',
          1010: 'Missing Extension',
          1011: 'Internal Error',
          1012: 'Service Restart',
          1013: 'Try Again Later',
          1014: 'Bad Gateway',
          1015: 'TLS Handshake'
        };
        
        const codeMeaning = codeMeanings[event.code] || 'Unknown';
        
        console.error('[WebSocket] Close event:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          codeMeaning,
          readyState: ws.readyState
        });
        setIsConnected(false);
        connectingRef.current = false; // Reset connecting flag on close
        
        if (event.code === 1000) {
          // Normal closure
          setConnectionStatus('disconnected');
          addSystemMessage('✗ Disconnected from game (normal closure)');
        } else if (event.code === 1006) {
          // Abnormal closure - connection was closed without a close frame
          setConnectionStatus('disconnected');
          addSystemMessage(`✗ Connection rejected (code ${event.code}: ${codeMeaning}). The server may have rejected the connection. Check that your userId matches the game's players.`);
          console.error('[WebSocket] Connection rejected - possible causes:', {
            userIdMismatch: 'userId does not match player1Id or player2Id',
            lambdaError: 'Lambda returned non-200 status',
            timeout: 'Lambda timed out (>10 seconds)',
            apiGatewayError: 'API Gateway rejected the connection'
          });
          // Don't retry on 1006 - it's a rejection, not a transient error
        } else if (event.code === 1001) {
          // Going away - server is shutting down or client navigating away
          setConnectionStatus('disconnected');
          addSystemMessage(`✗ Connection closed (code ${event.code}: ${codeMeaning})`);
        } else if (event.code >= 1002 && event.code <= 1011) {
          // Protocol or data errors
          setConnectionStatus('disconnected');
          addSystemMessage(`✗ Connection error (code ${event.code}: ${codeMeaning})`);
        } else {
          // Other error codes
          setConnectionStatus('disconnected');
          addSystemMessage(`✗ Connection lost (code ${event.code}: ${codeMeaning}). Please refresh the page to reconnect.`);
        }
      };

      setWsConnection(ws);
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setConnectionStatus('disconnected');
      addSystemMessage(`✗ Failed to connect to game: ${error instanceof Error ? error.message : 'Unknown error'}`);
      connectingRef.current = false;
    }
  }, [user?.userId, wsConnection, addSystemMessage, handleWebSocketMessage, currentGame]);

  const sendChatMessage = useCallback(() => {
    if (!chatInput.trim()) {
      console.log('[sendChatMessage] No input text');
      return;
    }
    
    if (!wsConnection) {
      console.error('[sendChatMessage] No WebSocket connection');
      addSystemMessage('✗ Not connected to game. Please wait for connection.');
      if (onErrorRef.current) {
        onErrorRef.current('Not connected to game. Please wait for connection.');
      }
      return;
    }
    
    if (wsConnection.readyState !== WebSocket.OPEN) {
      const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][wsConnection.readyState];
      console.error('[sendChatMessage] WebSocket not open. ReadyState:', wsConnection.readyState);
      addSystemMessage(`✗ WebSocket connection not ready (${readyStateText}). Please wait.`);
      if (onErrorRef.current) {
        onErrorRef.current('WebSocket connection not ready. Please wait.');
      }
      return;
    }
    
    if (!currentGame) {
      console.error('[sendChatMessage] No current game');
      return;
    }

    const playerName = currentGame.player1.userId === user?.userId 
      ? currentGame.player1.name 
      : (currentGame.player2?.name || 'Player');

    const chatPayload = {
      action: 'chat',
      gameId: currentGame.gameId,
      message: chatInput.trim(),
      player: playerName,
      userId: user?.userId // Include immutable userId (sub)
    };

    console.log('[sendChatMessage] Sending chat message:', chatPayload);
    
    try {
      wsConnection.send(JSON.stringify(chatPayload));
      console.log('[sendChatMessage] Message sent successfully');
      setChatInput('');
      // Note: The message will appear in chat when received back from server
    } catch (error) {
      console.error('[sendChatMessage] Error sending message:', error);
      addSystemMessage(`✗ Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (onErrorRef.current) {
        onErrorRef.current('Failed to send message. Please try again.');
      }
    }
  }, [chatInput, wsConnection, currentGame, user?.userId, addSystemMessage]);

  const sendGameEvent = useCallback((action: string, eventData?: any) => {
    if (!wsConnection) {
      console.error('[sendGameEvent] No WebSocket connection');
      addSystemMessage('✗ Not connected to game. Please wait for connection.');
      return;
    }
    
    if (wsConnection.readyState !== WebSocket.OPEN) {
      const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][wsConnection.readyState];
      console.error('[sendGameEvent] WebSocket not open. ReadyState:', wsConnection.readyState);
      addSystemMessage(`✗ WebSocket connection not ready (${readyStateText}). Please wait.`);
      return;
    }
    
    if (!currentGame) {
      console.error('[sendGameEvent] No current game');
      return;
    }

    const eventPayload = {
      action,
      gameId: currentGame.gameId,
      ...eventData
    };

    console.log('[sendGameEvent] Sending game event:', eventPayload);
    
    try {
      wsConnection.send(JSON.stringify(eventPayload));
      console.log('[sendGameEvent] Event sent successfully');
    } catch (error) {
      console.error('[sendGameEvent] Error sending event:', error);
      addSystemMessage(`✗ Failed to send game event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [wsConnection, currentGame, addSystemMessage]);

  // Connect when gameId changes
  // Use ref to prevent infinite loops - only connect when gameId or userId actually changes
  useEffect(() => {
    // Only connect if gameId/userId changed AND we're not already connecting
    if (gameId && user?.userId && !connectingRef.current) {
      // Check if gameId or userId actually changed
      if (gameId !== lastGameIdRef.current || user.userId !== lastUserIdRef.current) {
        lastGameIdRef.current = gameId;
        lastUserIdRef.current = user.userId;
        connectingRef.current = true;
        connectWebSocket(gameId);
        // Reset connecting flag after a delay to allow connection to complete or fail
        setTimeout(() => {
          connectingRef.current = false;
        }, 1000);
      }
    }
  }, [gameId, user?.userId]); // Removed connectWebSocket from dependencies to prevent infinite loops

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [wsConnection]);

  // Disconnect when game changes
  useEffect(() => {
    if (wsConnection && !currentGame) {
      addSystemMessage('Game changed. Disconnecting...');
      wsConnection.close();
      setWsConnection(null);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      setPlayerConnections({ player1: false, player2: false });
      setChatMessages([]);
    }
  }, [currentGame, wsConnection, addSystemMessage]);

  return {
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
  };
}

