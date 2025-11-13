/**
 * Helper functions for broadcasting WebSocket messages from API routes
 * Uses AWS API Gateway Management API to send messages to WebSocket connections
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || '';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';

// Initialize clients
let apiGatewayClient: ApiGatewayManagementApiClient | null = null;
let dynamoClient: DynamoDBDocumentClient | null = null;

function getApiGatewayClient(): ApiGatewayManagementApiClient {
  if (!apiGatewayClient) {
    if (!WEBSOCKET_ENDPOINT) {
      throw new Error('WEBSOCKET_ENDPOINT environment variable not set');
    }
    apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT
    });
  }
  return apiGatewayClient;
}

function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!dynamoClient) {
    if (!CONNECTIONS_TABLE) {
      throw new Error('CONNECTIONS_TABLE environment variable not set');
    }
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    dynamoClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoClient;
}

/**
 * Broadcast a message to all WebSocket connections for a game
 */
export async function broadcastToGame(
  gameId: string,
  message: any
): Promise<{ successCount: number; failCount: number }> {
  console.log('[broadcastToGame] Starting broadcast:', {
    gameId,
    hasWebSocketEndpoint: !!WEBSOCKET_ENDPOINT,
    hasConnectionsTable: !!CONNECTIONS_TABLE,
    websocketEndpoint: WEBSOCKET_ENDPOINT || 'NOT SET',
    connectionsTable: CONNECTIONS_TABLE || 'NOT SET'
  });

  if (!WEBSOCKET_ENDPOINT || !CONNECTIONS_TABLE) {
    console.warn('[broadcastToGame] WebSocket not configured, skipping broadcast', {
      WEBSOCKET_ENDPOINT: WEBSOCKET_ENDPOINT || 'MISSING',
      CONNECTIONS_TABLE: CONNECTIONS_TABLE || 'MISSING'
    });
    return { successCount: 0, failCount: 0 };
  }

  try {
    // Get all connections for this game
    console.log('[broadcastToGame] Querying connections for game:', gameId);
    const queryResult = await getDynamoDBClient().send(new QueryCommand({
      TableName: CONNECTIONS_TABLE,
      IndexName: 'gameId-index',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      }
    }));

    const gameConnections = queryResult.Items;
    console.log('[broadcastToGame] Query result:', {
      gameId,
      connectionCount: gameConnections?.length || 0,
      connections: gameConnections?.map(c => ({
        connectionId: c.connectionId,
        userId: c.userId,
        playerIndex: c.playerIndex
      })) || []
    });

    if (!gameConnections || gameConnections.length === 0) {
      console.log(`[broadcastToGame] No connections found for game ${gameId}`);
      return { successCount: 0, failCount: 0 };
    }

    const messageStr = JSON.stringify(message);
    const apiGateway = getApiGatewayClient();
    let successCount = 0;
    let failCount = 0;

    // Broadcast to all connections
    console.log(`[broadcastToGame] Broadcasting to ${gameConnections.length} connections`);
    for (const connection of gameConnections) {
      try {
        console.log(`[broadcastToGame] Sending to connection ${connection.connectionId} (userId: ${connection.userId}, playerIndex: ${connection.playerIndex})`);
        await apiGateway.send(new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: Buffer.from(messageStr)
        }));
        console.log(`[broadcastToGame] Successfully sent to connection ${connection.connectionId}`);
        successCount++;
      } catch (err: any) {
        console.error(`[broadcastToGame] Failed to send to connection ${connection.connectionId}:`, {
          error: err.message,
          statusCode: err.$metadata?.httpStatusCode,
          code: err.code,
          name: err.name
        });
        
        // Remove stale connections (410 Gone or 403 Forbidden)
        if (err.$metadata?.httpStatusCode === 410 || err.$metadata?.httpStatusCode === 403) {
          console.log(`[broadcastToGame] Removing stale connection ${connection.connectionId}`);
          // Note: We could delete the connection here, but it's better to let the disconnect handler do it
        }
        failCount++;
      }
    }

    console.log(`[broadcastToGame] Broadcast complete for game ${gameId}: ${successCount} success, ${failCount} failed`);
    return { successCount, failCount };
  } catch (error) {
    console.error('[broadcastToGame] Error broadcasting:', error);
    throw error;
  }
}

