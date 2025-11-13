import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { Buffer } from 'buffer';
import { Game, Scenario, PlayerNumber, GamePhase, GameAction, UnitStatus } from '@/shared/types';

const GAMES_TABLE = process.env.GAMES_TABLE || process.env.NEXT_PUBLIC_GAMES_TABLE || '';
const PLAYER_GAMES_TABLE = process.env.PLAYER_GAMES_TABLE || process.env.NEXT_PUBLIC_PLAYER_GAMES_TABLE || '';
const SCENARIOS_TABLE = process.env.SCENARIOS_TABLE || process.env.NEXT_PUBLIC_SCENARIOS_TABLE || '';

// Initialize AWS SDK v3 DynamoDB client
// AWS SDK will automatically resolve credentials from:
// - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
// - AWS credentials file (~/.aws/credentials) - mounted in Docker container
// - IAM role (when running on EC2/Lambda)
// All environments (prod, dev, local) use real DynamoDB - configured via environment variables
let dynamodbClient: DynamoDBDocumentClient | null = null;

// Helper function to validate DynamoDB configuration at runtime (not build time)
function validateDynamoDBConfig() {
  if (!SCENARIOS_TABLE || !GAMES_TABLE || !PLAYER_GAMES_TABLE) {
    throw new Error('DynamoDB table names not configured. Set SCENARIOS_TABLE, GAMES_TABLE, and PLAYER_GAMES_TABLE environment variables.');
  }
}

// Initialize DynamoDB client lazily (only when needed, not at module load time)
function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!dynamodbClient) {
    validateDynamoDBConfig();
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1'
    });
    dynamodbClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true, // Remove undefined values before sending to DynamoDB
      },
    });
  }
  
  return dynamodbClient;
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Save game to database
 * 
 * Note: This saves the entire game record. Fields are organized as:
 * - Fixed/Static: gameId, title, scenarioId, scenarioSnapshot, player1, player2, player1Id, player2Id, createdAt
 * - Dynamic: gameState (contains turnNumber and future gameplay state), updatedAt
 * 
 * During gameplay, only dynamic fields should change. Fixed fields are set at creation
 * and only change via admin operations (e.g., title rename, game reset).
 */
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
  
  // Save the game
  await getDynamoDBClient().send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: gameWithIndex
  }));
  
  // Get existing player-game relationships for this game
  const existingQuery = await getDynamoDBClient().send(new QueryCommand({
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
  await getDynamoDBClient().send(new PutCommand({
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
    await getDynamoDBClient().send(new PutCommand({
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
      await getDynamoDBClient().send(new DeleteCommand({
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
  try {
    const result = await getDynamoDBClient().send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { gameId }
    }));
    
    if (!result.Item) {
      return null;
    }
    
    const game = result.Item as Game;
    
    let needsSave = false;
    
    // Migration: Ensure activePlayer, phase, and action are set (for backward compatibility with old games)
    if (!game.gameState?.activePlayer || !game.gameState?.phase || !game.gameState?.action) {
      game.gameState = {
        ...game.gameState,
        turnNumber: game.gameState?.turnNumber ?? 1,
        activePlayer: game.gameState?.activePlayer ?? PlayerNumber.Player1,
        phase: game.gameState?.phase ?? GamePhase.Movement,
        action: game.gameState?.action ?? GameAction.SelectUnit
      };
      needsSave = true;
    }

    // Migration: Ensure units array exists in game state
    if (!game.gameState?.units || !Array.isArray(game.gameState.units) || game.gameState.units.length === 0) {
      const scenarioUnits = game.scenarioSnapshot?.units || [];
      const activePlayer = game.gameState?.activePlayer ?? PlayerNumber.Player1;
      game.gameState = {
        ...game.gameState,
        units: scenarioUnits.map(unit => ({
          ...unit,
          status: (unit.status || (unit.player === activePlayer ? 'available' : 'unavailable')) as UnitStatus,
        })),
      };
      needsSave = true;
    }

    if (needsSave) {
      // Save the migrated game back to the database
      await saveGame(game);
    }
    
    return game;
  } catch (error: any) {
    // No fallback - fail explicitly if credentials are missing
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      throw new Error('AWS credentials not available. Configure AWS credentials to access DynamoDB. See deploy-local.sh for setup instructions.');
    }
    throw error;
  }
}

export async function deleteGame(gameId: string): Promise<void> {
  // Get all player-game relationships for this game
  const playerGamesQuery = await getDynamoDBClient().send(new QueryCommand({
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
      await getDynamoDBClient().send(new DeleteCommand({
        TableName: PLAYER_GAMES_TABLE,
        Key: {
          playerId: item.playerId as string,
          gameId: gameId
        }
      }));
    }
  }
  
  // Delete the game itself
  await getDynamoDBClient().send(new DeleteCommand({
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
  
  try {
    if (player1Id) {
      // Query games where player is player1 using GSI on games table
      const result = await getDynamoDBClient().send(new QueryCommand({
        TableName: GAMES_TABLE,
        IndexName: 'player1Id-index',
        KeyConditionExpression: 'player1Id = :player1Id',
        ExpressionAttributeValues: {
          ':player1Id': player1Id
        },
        Limit: queryLimit,
        ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
      }));
      
      const items = (result.Items || []) as Game[];
      
      return {
        items,
        nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
        hasMore: !!result.LastEvaluatedKey
      };
    } else if (player2Id) {
    // Query games where player is player2 using GSI on games table
    const result = await getDynamoDBClient().send(new QueryCommand({
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
    const result = await getDynamoDBClient().send(new QueryCommand({
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
    const batchResult = await getDynamoDBClient().send(new BatchGetCommand({
      RequestItems: {
        [GAMES_TABLE]: {
          Keys: gameIds.map(gameId => ({ gameId }))
        }
      }
    }));
    
    const items = (batchResult.Responses?.[GAMES_TABLE] || []) as Game[];
    
    return {
      items,
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  } else {
    // No filter provided - require at least one filter to avoid expensive scans
    throw new Error('At least one filter parameter (playerId, player1Id, or player2Id) must be provided. Scans are not allowed for performance and cost reasons.');
  }
  } catch (error: any) {
    // No fallback - fail explicitly if credentials are missing
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      throw new Error('AWS credentials not available. Configure AWS credentials to access DynamoDB. See deploy-local.sh for setup instructions.');
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
  
  await getDynamoDBClient().send(new PutCommand({
    TableName: SCENARIOS_TABLE,
    Item: scenarioWithQueryKey
  }));
}

export async function getScenario(scenarioId: string): Promise<Scenario | null> {
  const result = await getDynamoDBClient().send(new GetCommand({
    TableName: SCENARIOS_TABLE,
    Key: { scenarioId }
  }));
  
  if (!result.Item) {
    return null;
  }
  
  const scenario = result.Item as Scenario;
  
  // Migration: Ensure all hexes have rivers and roads properties (default to 0 for backward compatibility)
  if (scenario.hexes && Array.isArray(scenario.hexes)) {
    scenario.hexes = scenario.hexes.map(hex => ({
      ...hex,
      rivers: hex.rivers ?? 0,
      roads: hex.roads ?? 0
    }));
  }
  
  return scenario;
}

export async function getAllScenarios(limit?: number, nextToken?: string, creatorId?: string): Promise<PaginatedResult<Scenario>> {
  const queryLimit = limit ? Math.min(limit, 100) : 100;
  
  const queryParams: any = {
    TableName: SCENARIOS_TABLE,
    Limit: queryLimit,
    ScanIndexForward: false // Most recent first
  };
  
  // If creatorId is provided, query by creator. Otherwise query all scenarios.
  if (creatorId) {
    queryParams.IndexName = 'creatorId-createdAt-index';
    queryParams.KeyConditionExpression = 'creatorId = :creatorId';
    queryParams.ExpressionAttributeValues = {
      ':creatorId': creatorId
    };
  } else {
    queryParams.IndexName = 'queryKey-createdAt-index';
    queryParams.KeyConditionExpression = 'queryKey = :queryKey';
    queryParams.ExpressionAttributeValues = {
      ':queryKey': 'ALL_SCENARIOS'
    };
  }
  
  if (nextToken) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    } catch (e) {
      console.error('Error decoding nextToken:', e);
    }
  }
  
  try {
    const result = await getDynamoDBClient().send(new QueryCommand(queryParams));

    const items = (result.Items || []) as Scenario[];

    return {
      items,
      nextToken: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined,
      hasMore: !!result.LastEvaluatedKey
    };
  } catch (error: any) {
    // No fallback - fail explicitly if credentials are missing
    if (error?.name === 'CredentialsProviderError' || error?.message?.includes('credentials')) {
      throw new Error('AWS credentials not available. Configure AWS credentials to access DynamoDB. See deploy-local.sh for setup instructions.');
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
  
  await getDynamoDBClient().send(new PutCommand({
    TableName: SCENARIOS_TABLE,
    Item: {
      ...scenario,
      queryKey: scenario.queryKey || existing.queryKey || 'ALL_SCENARIOS',
      updatedAt: new Date().toISOString()
    }
  }));
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  await getDynamoDBClient().send(new DeleteCommand({
    TableName: SCENARIOS_TABLE,
    Key: { scenarioId }
  }));
}

