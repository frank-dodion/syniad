import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { Buffer } from 'buffer';
import { Game, Scenario } from '@/shared/types';

const GAMES_TABLE = process.env.GAMES_TABLE || process.env.NEXT_PUBLIC_GAMES_TABLE || '';
const PLAYER_GAMES_TABLE = process.env.PLAYER_GAMES_TABLE || process.env.NEXT_PUBLIC_PLAYER_GAMES_TABLE || '';
const SCENARIOS_TABLE = process.env.SCENARIOS_TABLE || process.env.NEXT_PUBLIC_SCENARIOS_TABLE || '';

// Check if we're in local mode (only when explicitly set to 'true')
// Otherwise, try to use real DynamoDB - AWS SDK will handle credential resolution
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';

// In-memory storage for local testing
const mockGames: Map<string, Game> = new Map();
const mockPlayerGames: Map<string, Map<string, { gameId: string; playerIndex: number; createdAt: string }>> = new Map(); // playerId -> Map<gameId, relationship>
const mockScenarios: Map<string, Scenario> = new Map();

// Initialize AWS SDK v3 DynamoDB client
// AWS SDK will automatically resolve credentials from:
// - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
// - AWS credentials file (~/.aws/credentials)
// - IAM role (when running on EC2/Lambda)
let dynamodbClient: DynamoDBDocumentClient | null = null;
if (!LOCAL_MODE) {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1'
  });
  dynamodbClient = DynamoDBDocumentClient.from(client);
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
}

export async function saveGame(game: Game): Promise<void> {
  const playerIds: string[] = [game.player1.userId];
  if (game.player2) {
    playerIds.push(game.player2.userId);
  }
  
  const gameWithIndex: Game = {
    ...game,
    player1Id: game.player1Id || game.player1.userId,
    player2Id: game.player2Id || (game.player2?.userId)
  };
  
  if (LOCAL_MODE || !dynamodbClient) {
    // Use mock storage
    mockGames.set(game.gameId, gameWithIndex);
    
    const player1Id = game.player1.userId;
    const player2Id = game.player2?.userId;
    
    // Update player1 relationship
    if (!mockPlayerGames.has(player1Id)) {
      mockPlayerGames.set(player1Id, new Map());
    }
    mockPlayerGames.get(player1Id)!.set(game.gameId, {
      gameId: game.gameId,
      playerIndex: 1,
      createdAt: new Date().toISOString()
    });
    
    // Update player2 relationship if exists
    if (player2Id) {
      if (!mockPlayerGames.has(player2Id)) {
        mockPlayerGames.set(player2Id, new Map());
      }
      mockPlayerGames.get(player2Id)!.set(game.gameId, {
        gameId: game.gameId,
        playerIndex: 2,
        createdAt: new Date().toISOString()
      });
    }
    
    // Remove old relationships for players no longer in the game
    for (const [playerId, games] of mockPlayerGames.entries()) {
      if (!playerIds.includes(playerId) && games.has(game.gameId)) {
        games.delete(game.gameId);
      }
    }
    return;
  }
  
  // Save the game
  await dynamodbClient.send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: gameWithIndex
  }));
  
  // Get existing player-game relationships for this game
  const existingQuery = await dynamodbClient.send(new QueryCommand({
    TableName: PLAYER_GAMES_TABLE,
    IndexName: 'gameId-index',
    KeyConditionExpression: 'gameId = :gameId',
    ExpressionAttributeValues: {
      ':gameId': game.gameId
    }
  }));
  
  const existingPlayerIds = new Set(
    (existingQuery.Items || []).map(item => item.playerId as string)
  );
  
  const player1Id = game.player1.userId;
  const player2Id = game.player2?.userId;
  
  // Update player1 relationship (always index 1 - creator)
  await dynamodbClient.send(new PutCommand({
    TableName: PLAYER_GAMES_TABLE,
    Item: {
      playerId: player1Id,
      gameId: game.gameId,
      playerIndex: 1,
      createdAt: new Date().toISOString()
    }
  }));
  
  // Update player2 relationship if exists (always index 2)
  if (player2Id) {
    await dynamodbClient.send(new PutCommand({
      TableName: PLAYER_GAMES_TABLE,
      Item: {
        playerId: player2Id,
        gameId: game.gameId,
        playerIndex: 2,
        createdAt: new Date().toISOString()
      }
    }));
  }
  
  // Remove old player-game relationships that are no longer valid
  const currentPlayerIds = new Set(playerIds);
  for (const existingPlayerId of existingPlayerIds) {
    if (!currentPlayerIds.has(existingPlayerId)) {
      await dynamodbClient.send(new DeleteCommand({
        TableName: PLAYER_GAMES_TABLE,
        Key: {
          playerId: existingPlayerId,
          gameId: game.gameId
        }
      }));
    }
  }
}

export async function getGame(gameId: string): Promise<Game | null> {
  if (LOCAL_MODE || !dynamodbClient) {
    return mockGames.get(gameId) || null;
  }
  
  try {
    const result = await dynamodbClient.send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { gameId }
    }));
    
    return result.Item as Game | null;
  } catch (error: any) {
    // If credentials are missing, fall back to mock data
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      console.warn('[api-db] AWS credentials not available, falling back to mock data. Set LOCAL_MODE=true to suppress this warning.');
      return mockGames.get(gameId) || null;
    }
    throw error;
  }
}

export async function deleteGame(gameId: string): Promise<void> {
  if (LOCAL_MODE || !dynamodbClient) {
    // Remove from mock storage
    mockGames.delete(gameId);
    // Remove all player-game relationships
    for (const games of mockPlayerGames.values()) {
      games.delete(gameId);
    }
    return;
  }
  
  // Get all player-game relationships for this game
  const playerGamesQuery = await dynamodbClient.send(new QueryCommand({
    TableName: PLAYER_GAMES_TABLE,
    IndexName: 'gameId-index',
    KeyConditionExpression: 'gameId = :gameId',
    ExpressionAttributeValues: {
      ':gameId': gameId
    }
  }));
  
  // Delete all player-game relationships
  if (playerGamesQuery.Items && playerGamesQuery.Items.length > 0) {
    for (const item of playerGamesQuery.Items) {
      await dynamodbClient.send(new DeleteCommand({
        TableName: PLAYER_GAMES_TABLE,
        Key: {
          playerId: item.playerId as string,
          gameId: gameId
        }
      }));
    }
  }
  
  // Delete the game itself
  await dynamodbClient.send(new DeleteCommand({
    TableName: GAMES_TABLE,
    Key: { gameId }
  }));
}

export async function getAllGames(
  limit?: number,
  nextToken?: string,
  playerId?: string,
  player1Id?: string,
  player2Id?: string
): Promise<PaginatedResult<Game>> {
  const queryLimit = limit ? Math.min(limit, 100) : 100;
  
  if (LOCAL_MODE || !dynamodbClient) {
    // Use mock storage
    let allGames = Array.from(mockGames.values());
    
    // Filter by player if specified
    if (player1Id) {
      allGames = allGames.filter(g => g.player1Id === player1Id || g.player1?.userId === player1Id);
    } else if (player2Id) {
      allGames = allGames.filter(g => g.player2Id === player2Id || g.player2?.userId === player2Id);
    } else if (playerId) {
      allGames = allGames.filter(g => 
        g.player1Id === playerId || 
        g.player1?.userId === playerId ||
        g.player2Id === playerId ||
        g.player2?.userId === playerId
      );
    }
    
    // Simple pagination (no token support in mock mode)
    const items = allGames.slice(0, queryLimit);
    
    return {
      items,
      hasMore: allGames.length > queryLimit
    };
  }
  
  // At this point, dynamodbClient is guaranteed to be non-null
  try {
    if (player1Id) {
      // Query games where player is player1 using GSI on games table
      const result = await dynamodbClient.send(new QueryCommand({
        TableName: GAMES_TABLE,
        IndexName: 'player1Id-index',
        KeyConditionExpression: 'player1Id = :player1Id',
        ExpressionAttributeValues: {
          ':player1Id': player1Id
        },
        Limit: queryLimit,
        ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
      }));
      
      return {
        items: (result.Items || []) as Game[],
        nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
        hasMore: !!result.LastEvaluatedKey
      };
    } else if (player2Id) {
    // Query games where player is player2 using GSI on games table
    const result = await dynamodbClient.send(new QueryCommand({
      TableName: GAMES_TABLE,
      IndexName: 'player2Id-index',
      KeyConditionExpression: 'player2Id = :player2Id',
      ExpressionAttributeValues: {
        ':player2Id': player2Id
      },
      Limit: queryLimit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
    }));
    
    return {
      items: (result.Items || []) as Game[],
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  } else if (playerId) {
    // Query games where player is either player1 or player2
    // Use player-games table which has playerId as partition key
    const result = await dynamodbClient.send(new QueryCommand({
      TableName: PLAYER_GAMES_TABLE,
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: {
        ':playerId': playerId
      },
      Limit: queryLimit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
    }));
    
    // Extract gameIds and batch get games
    const gameIds = (result.Items || []).map(item => item.gameId as string).filter(id => !!id);
    
    if (gameIds.length === 0) {
      return {
        items: [],
        nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
        hasMore: !!result.LastEvaluatedKey
      };
    }
    
    // Batch get games
    const batchResult = await dynamodbClient.send(new BatchGetCommand({
      RequestItems: {
        [GAMES_TABLE]: {
          Keys: gameIds.map(gameId => ({ gameId }))
        }
      }
    }));
    
    return {
      items: (batchResult.Responses?.[GAMES_TABLE] || []) as Game[],
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  } else {
    // Get all games (scan)
    const result = await dynamodbClient.send(new ScanCommand({
      TableName: GAMES_TABLE,
      Limit: queryLimit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
    }));
    
    return {
      items: (result.Items || []) as Game[],
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  }
  } catch (error: any) {
    // If credentials are missing, fall back to mock data
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      console.warn('[api-db] AWS credentials not available, falling back to mock data. Set LOCAL_MODE=true to suppress this warning.');
      // Use mock storage fallback
      let allGames = Array.from(mockGames.values());
      
      // Filter by player if specified
      if (player1Id) {
        allGames = allGames.filter(g => g.player1Id === player1Id || g.player1?.userId === player1Id);
      } else if (player2Id) {
        allGames = allGames.filter(g => g.player2Id === player2Id || g.player2?.userId === player2Id);
      } else if (playerId) {
        allGames = allGames.filter(g => 
          g.player1Id === playerId || 
          g.player1?.userId === playerId ||
          g.player2Id === playerId ||
          g.player2?.userId === playerId
        );
      }
      
      const items = allGames.slice(0, queryLimit);
      
      return {
        items,
        hasMore: allGames.length > queryLimit
      };
    }
    throw error;
  }
}

export async function saveScenario(scenario: Scenario): Promise<void> {
  // Ensure queryKey is set for efficient querying
  const scenarioWithQueryKey: Scenario = {
    ...scenario,
    queryKey: scenario.queryKey || 'ALL_SCENARIOS'
  };
  
  if (LOCAL_MODE || !dynamodbClient) {
    mockScenarios.set(scenario.scenarioId, scenarioWithQueryKey);
    return;
  }
  
  await dynamodbClient.send(new PutCommand({
    TableName: SCENARIOS_TABLE,
    Item: scenarioWithQueryKey
  }));
}

export async function getScenario(scenarioId: string): Promise<Scenario | null> {
  if (LOCAL_MODE || !dynamodbClient) {
    return mockScenarios.get(scenarioId) || null;
  }
  
  const result = await dynamodbClient.send(new GetCommand({
    TableName: SCENARIOS_TABLE,
    Key: { scenarioId }
  }));
  
  return result.Item as Scenario | null;
}

export async function getAllScenarios(limit?: number, nextToken?: string): Promise<PaginatedResult<Scenario>> {
  const queryLimit = limit ? Math.min(limit, 100) : 100;
  
  if (LOCAL_MODE || !dynamodbClient) {
    // Use mock storage
    const allScenarios = Array.from(mockScenarios.values())
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // Most recent first
      });
    
    const items = allScenarios.slice(0, queryLimit);
    
    return {
      items,
      hasMore: allScenarios.length > queryLimit
    };
  }
  
  const queryParams: any = {
    TableName: SCENARIOS_TABLE,
    IndexName: 'queryKey-createdAt-index',
    KeyConditionExpression: 'queryKey = :queryKey',
    ExpressionAttributeValues: {
      ':queryKey': 'ALL_SCENARIOS'
    },
    Limit: queryLimit,
    ScanIndexForward: false // Most recent first
  };
  
  if (nextToken) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    } catch (e) {
      console.error('Error decoding nextToken:', e);
    }
  }
  
  try {
    const result = await dynamodbClient.send(new QueryCommand(queryParams));

    return {
      items: (result.Items || []) as Scenario[],
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  } catch (error: any) {
    // If credentials are missing, fall back to mock data
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      console.warn('[api-db] AWS credentials not available, falling back to mock data. Set LOCAL_MODE=true to suppress this warning.');
      // Use mock storage fallback
      const allScenarios = Array.from(mockScenarios.values())
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime; // Most recent first
        });
      
      const items = allScenarios.slice(0, queryLimit);
      
      return {
        items,
        hasMore: allScenarios.length > queryLimit
      };
    }
    throw error;
  }
}

export async function updateScenario(scenario: Scenario): Promise<void> {
  // Ensure queryKey is preserved
  const existing = await getScenario(scenario.scenarioId);
  if (!existing) {
    throw new Error('Scenario not found');
  }
  
  if (LOCAL_MODE || !dynamodbClient) {
    const updatedScenario: Scenario = {
      ...scenario,
      queryKey: scenario.queryKey || existing.queryKey || 'ALL_SCENARIOS',
      updatedAt: new Date().toISOString()
    };
    mockScenarios.set(scenario.scenarioId, updatedScenario);
    return;
  }
  
  await dynamodbClient.send(new PutCommand({
    TableName: SCENARIOS_TABLE,
    Item: {
      ...scenario,
      queryKey: scenario.queryKey || existing.queryKey || 'ALL_SCENARIOS',
      updatedAt: new Date().toISOString()
    }
  }));
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  if (LOCAL_MODE || !dynamodbClient) {
    mockScenarios.delete(scenarioId);
    return;
  }
  
  await dynamodbClient.send(new DeleteCommand({
    TableName: SCENARIOS_TABLE,
    Key: { scenarioId }
  }));
}

