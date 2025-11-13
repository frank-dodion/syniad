const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const GAMES_TABLE = process.env.GAMES_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

exports.handler = async (event) => {
  console.log('WebSocket Disconnect Event:', JSON.stringify(event, null, 2));
  
  const connectionId = event.requestContext.connectionId;
  
  try {
    // Get connection info before deleting
    const { Item: connection } = await dynamoClient.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId }
    }));
    
    if (connection) {
      const { gameId, playerIndex, userId } = connection;
      
      // Get game to fetch player name
      let playerName = `Player ${playerIndex}`;
      if (GAMES_TABLE) {
        try {
          const { Item: game } = await dynamoClient.send(new GetCommand({
            TableName: GAMES_TABLE,
            Key: { gameId }
          }));
          if (game) {
            playerName = playerIndex === 1 ? game.player1.name : (game.player2?.name || `Player ${playerIndex}`);
          }
        } catch (err) {
          console.log(`[PlayerDisconnected] Failed to fetch game for player name:`, err.message);
        }
      }
      
      // Delete connection from DynamoDB first (before querying for remaining connections)
      await dynamoClient.send(new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          connectionId
        }
      }));
      
      // Query remaining connections for this game (after deletion)
      const { Items: remainingConnections } = await dynamoClient.send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'gameId-index',
        KeyConditionExpression: 'gameId = :gameId',
        ExpressionAttributeValues: {
          ':gameId': gameId
        }
      }));
      
      // Broadcast updated connection state to all remaining players
      if (remainingConnections && remainingConnections.length > 0 && WEBSOCKET_ENDPOINT) {
        const apiGatewayClient = new ApiGatewayManagementApiClient({
          endpoint: WEBSOCKET_ENDPOINT
        });
        
        // Build connection state: determine which players are still connected
        const player1Connected = remainingConnections.some(c => c.playerIndex === 1);
        const player2Connected = remainingConnections.some(c => c.playerIndex === 2);
        
        // Get game to fetch player names
        let game = null;
        if (GAMES_TABLE) {
          try {
            const { Item: gameItem } = await dynamoClient.send(new GetCommand({
              TableName: GAMES_TABLE,
              Key: { gameId }
            }));
            game = gameItem;
          } catch (err) {
            console.log(`[ConnectionState] Failed to fetch game for player names:`, err.message);
          }
        }
        
        const connectionStateMessage = JSON.stringify({
          type: 'connectionStateUpdate',
          gameId,
          connections: {
            player1: {
              connected: player1Connected,
              userId: game?.player1Id || null,
              playerName: game?.player1?.name || `Player 1`
            },
            player2: game?.player2 ? {
              connected: player2Connected,
              userId: game.player2Id,
              playerName: game.player2.name
            } : null
          },
          timestamp: new Date().toISOString()
        });
        
        // Broadcast to all remaining connections
        for (const remainingConnection of remainingConnections) {
          try {
            await apiGatewayClient.send(new PostToConnectionCommand({
              ConnectionId: remainingConnection.connectionId,
              Data: Buffer.from(connectionStateMessage)
            }));
            console.log(`[ConnectionState] Broadcasted updated state to connection ${remainingConnection.connectionId}`);
          } catch (err) {
            // Connection may have already closed, ignore
            console.log(`[ConnectionState] Failed to notify connection ${remainingConnection.connectionId}:`, err.message);
          }
        }
      }
      
      console.log(`Connection ${connectionId} removed for game ${gameId}, player ${playerIndex}`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' })
    };
  } catch (error) {
    console.error('Error in WebSocket disconnect:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

