const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const GAMES_TABLE = process.env.GAMES_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

exports.handler = async (event) => {
  console.log('WebSocket Message Event:', JSON.stringify(event, null, 2));
  
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');
  const { action, gameId, message, player, userId } = body;
  
  try {
    // Get connection info
    const { Item: connection } = await dynamoClient.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId }
    }));
    
    if (!connection) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Connection not found' })
      };
    }
    
    // Update last activity
    await dynamoClient.send(new UpdateCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: 'SET lastActivity = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    }));
    
    // Handle different message types
    if (action === 'chat') {
      const targetGameId = gameId || connection.gameId;
      console.log('[Chat] Processing chat message:', {
        action,
        gameId: targetGameId,
        message,
        player,
        connectionId,
        connectionGameId: connection.gameId
      });
      
      // Broadcast chat message to ALL connections in the game
      // This includes all devices/browsers for all players (supports multiple devices per player)
      const { Items: gameConnections } = await dynamoClient.send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'gameId-index',
        KeyConditionExpression: 'gameId = :gameId',
        ExpressionAttributeValues: {
          ':gameId': targetGameId
        }
      }));
      
      console.log('[Chat] Found connections for game:', {
        gameId: targetGameId,
        connectionCount: gameConnections?.length || 0,
        connectionIds: gameConnections?.map(c => c.connectionId) || []
      });
      
      // Use userId from message if provided, otherwise fall back to connection userId
      const messageUserId = userId || connection.userId;
      
      const chatMessage = JSON.stringify({
        type: 'chat',
        gameId: targetGameId,
        player: player || `Player ${connection.playerIndex}`,
        userId: messageUserId, // Include immutable userId (sub) for player identification
        message,
        timestamp: new Date().toISOString()
      });
      
      if (gameConnections && gameConnections.length > 0 && WEBSOCKET_ENDPOINT) {
        console.log('[Chat] Using WebSocket endpoint:', WEBSOCKET_ENDPOINT);
        const apiGatewayClient = new ApiGatewayManagementApiClient({
          endpoint: WEBSOCKET_ENDPOINT
        });
        
        let successCount = 0;
        let failCount = 0;
        
        for (const gameConnection of gameConnections) {
          console.log(`[Chat] Attempting to send to connection ${gameConnection.connectionId} (userId: ${gameConnection.userId}, playerIndex: ${gameConnection.playerIndex})`);
          try {
            await apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: gameConnection.connectionId,
              Data: Buffer.from(chatMessage)
            }));
            console.log(`[Chat] Successfully sent to connection ${gameConnection.connectionId}`);
            successCount++;
          } catch (err) {
            console.error(`[Chat] Failed to send message to connection ${gameConnection.connectionId}:`, {
              error: err.message,
              code: err.code,
              statusCode: err.$metadata?.httpStatusCode
            });
            
            // If connection is gone (410 Gone) or forbidden (403), remove it from DynamoDB
            if (err.$metadata?.httpStatusCode === 410 || err.$metadata?.httpStatusCode === 403) {
              console.log(`[Chat] Removing stale connection ${gameConnection.connectionId} from DynamoDB`);
              try {
                await dynamoClient.send(new DeleteCommand({
                  TableName: CONNECTIONS_TABLE,
                  Key: { connectionId: gameConnection.connectionId }
                }));
              } catch (deleteErr) {
                console.error(`[Chat] Failed to delete stale connection:`, deleteErr);
              }
            }
            
            failCount++;
          }
        }
        
        console.log('[Chat] Broadcast complete:', {
          totalConnections: gameConnections.length,
          successCount,
          failCount
        });
      } else {
        console.warn('[Chat] No connections found or WebSocket endpoint not configured:', {
          hasConnections: !!gameConnections && gameConnections.length > 0,
          hasEndpoint: !!WEBSOCKET_ENDPOINT,
          endpoint: WEBSOCKET_ENDPOINT
        });
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Chat message sent' })
      };
    }
    
    // For other actions (moveUnit, selectUnit, endTurn, etc.)
    // Update game state and broadcast to all players
    if (gameId && WEBSOCKET_ENDPOINT) {
      // Get current game state
      const { Item: game } = await dynamoClient.send(new GetCommand({
        TableName: GAMES_TABLE,
        Key: { gameId }
      }));
      
      if (!game) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Game not found' })
        };
      }
      
      // TODO: Validate action and update game state based on action type
      // For now, just broadcast the action to all players
      // This broadcasts to ALL connections (supports multiple devices per player)
      
      const { Items: gameConnections } = await dynamoClient.send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'gameId-index',
        KeyConditionExpression: 'gameId = :gameId',
        ExpressionAttributeValues: {
          ':gameId': gameId
        }
      }));
      
      // Create filtered game state without scenarioSnapshot to minimize payload
      // Only send mutable game state, not the scenario snapshot (which is only needed for initial setup)
      const { scenarioSnapshot, scenarioId, ...gameStateWithoutSnapshot } = game;
      const filteredGameState = gameStateWithoutSnapshot;
      
      const stateUpdate = JSON.stringify({
        type: 'gameStateUpdate',
        gameId,
        action,
        gameState: filteredGameState, // Only mutable game state, no scenario snapshot
        timestamp: new Date().toISOString()
      });
      
      if (gameConnections && gameConnections.length > 0) {
        const apiGatewayClient = new ApiGatewayManagementApiClient({
          endpoint: WEBSOCKET_ENDPOINT
        });
        
        for (const gameConnection of gameConnections) {
          try {
            await apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: gameConnection.connectionId,
              Data: Buffer.from(stateUpdate)
            }));
          } catch (err) {
            console.log(`Failed to send state update to connection ${gameConnection.connectionId}:`, err.message);
          }
        }
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message processed' })
    };
  } catch (error) {
    console.error('Error in WebSocket message handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

