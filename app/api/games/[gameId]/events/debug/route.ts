import { NextRequest } from 'next/server';
import { extractUserIdentity } from '@/lib/api-auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/ts-rest-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// GET /api/games/[gameId]/events/debug - Diagnostic endpoint to check WebSocket broadcast setup and connections
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = await extractUserIdentity(request);
    
    const pathParams = await params;
    const { gameId } = pathParams;

    const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
    const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

    let connections: any[] = [];
    let queryError: string | null = null;

    if (CONNECTIONS_TABLE) {
      try {
        const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        const queryResult = await dynamoClient.send(new QueryCommand({
          TableName: CONNECTIONS_TABLE,
          IndexName: 'gameId-index',
          KeyConditionExpression: 'gameId = :gameId',
          ExpressionAttributeValues: {
            ':gameId': gameId
          }
        }));
        connections = queryResult.Items || [];
      } catch (err: any) {
        queryError = err.message || 'Unknown error';
      }
    }

    const diagnostics = {
      gameId,
      environment: {
        connectionsTable: CONNECTIONS_TABLE || 'NOT SET',
        websocketEndpoint: WEBSOCKET_ENDPOINT || 'NOT SET',
        hasConnectionsTable: !!CONNECTIONS_TABLE,
        hasWebSocketEndpoint: !!WEBSOCKET_ENDPOINT,
        awsRegion: process.env.AWS_REGION || 'NOT SET',
      },
      connections: {
        count: connections.length,
        items: connections.map(c => ({
          connectionId: c.connectionId,
          userId: c.userId,
          playerIndex: c.playerIndex,
          connectedAt: c.connectedAt,
          lastActivity: c.lastActivity
        })),
        queryError: queryError || null
      },
      user: user ? {
        userId: user.userId,
        email: user.email
      } : null,
      timestamp: new Date().toISOString()
    };

    return createSuccessResponse(200, diagnostics, user);
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Unknown error');
  }
}

