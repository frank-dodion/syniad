const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const GAMES_TABLE = process.env.GAMES_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

// Log environment variables at startup (for debugging)
console.log('WebSocket Connect Lambda initialized:', {
  hasConnectionsTable: !!CONNECTIONS_TABLE,
  hasGamesTable: !!GAMES_TABLE,
  connectionsTable: CONNECTIONS_TABLE,
  gamesTable: GAMES_TABLE
});

exports.handler = async (event) => {
  console.log('WebSocket Connect Event:', JSON.stringify(event, null, 2));
  
  // Validate event structure
  if (!event || !event.requestContext) {
    console.error('Invalid event structure - missing requestContext');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid event structure' })
    };
  }
  
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  
  if (!connectionId) {
    console.error('Missing connectionId in requestContext');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing connectionId' })
    };
  }
  
  // Extract query parameters or headers for authentication
  const queryParams = event.queryStringParameters || {};
  const gameId = queryParams.gameId;
  const userIdFromQuery = queryParams.userId;
  const token = queryParams.token;
  
  console.log('Extracted parameters:', { connectionId, gameId, userId: userIdFromQuery, hasToken: !!token });
  
  // Validate required parameters
  if (!gameId || !userIdFromQuery) {
    console.error('Missing required parameters:', { gameId: !!gameId, userId: !!userIdFromQuery });
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing gameId or userId' })
    };
  }
  
  // Log connection attempt for debugging
  console.log('WebSocket connection attempt:', { gameId, userId: userIdFromQuery, hasToken: !!token });
  
  // TODO: Validate token and extract userId from token for security
  // For now, we use userId from query params but should validate it matches token
  // This allows multiple devices per user to connect
  const userId = userIdFromQuery;
  
  // Validate environment variables before proceeding
  if (!CONNECTIONS_TABLE || !GAMES_TABLE) {
    console.error('Missing required environment variables:', {
      hasConnectionsTable: !!CONNECTIONS_TABLE,
      hasGamesTable: !!GAMES_TABLE
    });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server configuration error: missing environment variables' })
    };
  }
  
  try {
    // Verify user has access to this game
    console.log('Fetching game from DynamoDB:', { gameId, gamesTable: GAMES_TABLE });
    const { Item: game } = await dynamoClient.send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { gameId }
    }));
    console.log('Game fetched:', { found: !!game, hasPlayer1Id: !!game?.player1Id, hasPlayer2Id: !!game?.player2Id });
    
    if (!game) {
      console.error('Game not found:', gameId);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Game not found' })
      };
    }
    
    // Check if userId (Cognito sub) matches either player
    // Always use userId/sub for player identification - it's immutable and reliable
    const userIdMatchesPlayer1 = game.player1Id === userId;
    const userIdMatchesPlayer2 = game.player2Id === userId;
    
    if (!userIdMatchesPlayer1 && !userIdMatchesPlayer2) {
      console.error('User does not have access to game:', {
        gameId,
        userId,
        player1Id: game.player1Id,
        player2Id: game.player2Id,
        userIdMatchesPlayer1,
        userIdMatchesPlayer2,
        // Additional debug info
        userIdLength: userId?.length,
        player1IdLength: game.player1Id?.length,
        player2IdLength: game.player2Id?.length
      });
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'User does not have access to this game',
          details: {
            userId,
            player1Id: game.player1Id,
            player2Id: game.player2Id,
            message: 'The userId you provided does not match player1Id or player2Id in the game. This might be due to a user ID mismatch between game creation and connection.'
          }
        })
      };
    }
    
    // Determine player index
    const playerIndex = game.player1Id === userId ? 1 : 2;
    
    // Store connection in DynamoDB
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
    
    console.log('Storing connection in DynamoDB:', { connectionId, gameId, userId, playerIndex, connectionsTable: CONNECTIONS_TABLE });
    await dynamoClient.send(new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId,
        gameId,
        userId,
        playerIndex,
        connectedAt: now,
        lastActivity: now,
        ttl
      }
    }));
    console.log('Connection stored successfully');
    
    console.log(`Connection ${connectionId} established for game ${gameId}, user ${userId}, player ${playerIndex}`);
    
    // Broadcast full connection state to all players when connection state changes
    if (WEBSOCKET_ENDPOINT) {
      try {
        console.log('[ConnectionState] Starting broadcast, querying connections for game:', gameId);
        // Query all connections for this game (including the one that just connected)
        const { Items: allConnections } = await dynamoClient.send(new QueryCommand({
          TableName: CONNECTIONS_TABLE,
          IndexName: 'gameId-index',
          KeyConditionExpression: 'gameId = :gameId',
          ExpressionAttributeValues: {
            ':gameId': gameId
          }
        }));
        
        console.log('[ConnectionState] Found connections:', {
          count: allConnections?.length || 0,
          connections: allConnections?.map(c => ({ connectionId: c.connectionId, playerIndex: c.playerIndex, userId: c.userId }))
        });
        
        // Build connection state: determine which players are connected
        // Note: DynamoDB GSI queries are eventually consistent, so the connection we just stored
        // might not appear in the query results yet. We manually include it in the calculation.
        const currentConnection = {
          connectionId,
          playerIndex,
          userId
        };
        
        // Combine query results with the current connection (in case it's not in query results due to eventual consistency)
        const allConnectionsIncludingCurrent = [...(allConnections || [])];
        if (!allConnectionsIncludingCurrent.some(c => c.connectionId === connectionId)) {
          allConnectionsIncludingCurrent.push(currentConnection);
          console.log('[ConnectionState] Added current connection to list (GSI eventual consistency workaround)');
        }
        
        const player1Connected = allConnectionsIncludingCurrent.some(c => c.playerIndex === 1);
        const player2Connected = allConnectionsIncludingCurrent.some(c => c.playerIndex === 2);
        
        console.log('[ConnectionState] Player connection status:', {
          player1Connected,
          player2Connected,
          player1Id: game.player1Id,
          player2Id: game.player2Id
        });
        
        const connectionStateMessage = JSON.stringify({
          type: 'connectionStateUpdate',
          gameId,
          connections: {
            player1: {
              connected: player1Connected,
              userId: game.player1Id,
              playerName: game.player1.name
            },
            player2: game.player2 ? {
              connected: player2Connected,
              userId: game.player2Id,
              playerName: game.player2.name
            } : null
          },
          timestamp: new Date().toISOString()
        });
        
        console.log('[ConnectionState] Message to broadcast:', connectionStateMessage);
        
        const apiGatewayClient = new ApiGatewayManagementApiClient({
          endpoint: WEBSOCKET_ENDPOINT
        });
        
        // Broadcast connection state to ALL connections (including the one that just connected)
        // Use allConnectionsIncludingCurrent to ensure we broadcast to the current connection even if GSI query missed it
        const connectionIdsToBroadcast = allConnectionsIncludingCurrent.map(c => c.connectionId);
        if (connectionIdsToBroadcast.length === 0) {
          console.log('[ConnectionState] No connections to broadcast to (this shouldn\'t happen - we just connected)');
        }
        
        console.log('[ConnectionState] Broadcasting to connections:', connectionIdsToBroadcast);
        
        for (const conn of allConnectionsIncludingCurrent) {
          try {
            console.log(`[ConnectionState] Attempting to send to connection ${conn.connectionId} (player ${conn.playerIndex})`);
            await apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: conn.connectionId,
              Data: Buffer.from(connectionStateMessage)
            }));
            console.log(`[ConnectionState] Successfully broadcasted state to connection ${conn.connectionId}`);
          } catch (err) {
            console.error(`[ConnectionState] Failed to notify connection ${conn.connectionId}:`, {
              error: err.message,
              code: err.code,
              statusCode: err.statusCode,
              connectionId: conn.connectionId
            });
          }
        }
      } catch (broadcastError) {
        console.error('[ConnectionState] Error broadcasting connection state:', {
          error: broadcastError.message,
          stack: broadcastError.stack,
          code: broadcastError.code
        });
        // Don't fail the connection if broadcast fails
      }
    } else {
      console.warn('[ConnectionState] WEBSOCKET_ENDPOINT not set, skipping broadcast');
    }
    
    // For WebSocket $connect with Lambda proxy integration, return success response
    // API Gateway establishes the WebSocket connection when it receives statusCode 200
    // Headers are not needed for WebSocket $connect - just statusCode 200
    console.log('Returning success response: statusCode 200');
    return {
      statusCode: 200
    };
  } catch (error) {
    console.error('Error in WebSocket connect:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      requestId: error.requestId
    });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        code: error.code
      })
    };
  }
};

