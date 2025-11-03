import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { Buffer } from 'buffer';
import { Game } from '../shared/types';

// In-memory storage for local testing
const mockStorage: Map<string, Game> = new Map();
const mockPlayerGames: Map<string, Set<string>> = new Map(); // playerId -> Set of gameIds

const GAMES_TABLE = process.env.GAMES_TABLE || '';
const PLAYER_GAMES_TABLE = process.env.PLAYER_GAMES_TABLE || '';
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';

// Use mock storage in local mode, real DynamoDB otherwise
const useMock = LOCAL_MODE;

// Initialize AWS SDK v3 DynamoDB client (only if not in local mode)
let dynamodbClient: DynamoDBDocumentClient | null = null;
if (!useMock) {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
  });
  dynamodbClient = DynamoDBDocumentClient.from(client);
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
}

export async function saveGame(game: Game): Promise<void> {
  // Extract player userIds from player1 and player2
  const playerIds: string[] = [game.player1.userId];
  if (game.player2) {
    playerIds.push(game.player2.userId);
  }
  
  // Ensure player1Id and player2Id are set (denormalized index fields for efficient queries)
  // player1Id always equals player1.userId (game creator)
  // player2Id equals player2.userId when player2 exists
  const gameWithIndex: Game = {
    ...game,
    player1Id: game.player1Id || game.player1.userId,
    player2Id: game.player2Id || (game.player2?.userId)
  };
  
  if (useMock) {
    // Local mode: use in-memory storage
    mockStorage.set(game.gameId, gameWithIndex);
    
    // Update player-games mapping
    for (const playerId of playerIds) {
      if (!mockPlayerGames.has(playerId)) {
        mockPlayerGames.set(playerId, new Set());
      }
      mockPlayerGames.get(playerId)!.add(game.gameId);
    }
    
    return Promise.resolve();
  }
  
  // Production: use real DynamoDB with AWS SDK v3
  // Save the game
  await dynamodbClient!.send(
    new PutCommand({
      TableName: GAMES_TABLE,
      Item: gameWithIndex
    })
  );
  
  // Update player-games mapping table
  // Get existing player-game relationships for this game
  const existingQuery = await dynamodbClient!.send(
    new QueryCommand({
      TableName: PLAYER_GAMES_TABLE,
      IndexName: 'gameId-index',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': game.gameId
      }
    })
  );
  
  const existingPlayerIds = new Set(
    (existingQuery.Items || []).map(item => item.playerId as string)
  );
  
  // Add new player-game relationships (player1 is index 1, player2 is index 2)
  const player1Id = game.player1.userId;
  const player2Id = game.player2?.userId;
  
  // Update player1 relationship (always index 1 - creator)
  if (!existingPlayerIds.has(player1Id)) {
    await dynamodbClient!.send(
      new PutCommand({
        TableName: PLAYER_GAMES_TABLE,
        Item: {
          playerId: player1Id,
          gameId: game.gameId,
          playerIndex: 1, // Player 1 is always the creator
          createdAt: new Date().toISOString()
        }
      })
    );
  } else {
    // Update existing relationship
    await dynamodbClient!.send(
      new PutCommand({
        TableName: PLAYER_GAMES_TABLE,
        Item: {
          playerId: player1Id,
          gameId: game.gameId,
          playerIndex: 1,
          createdAt: new Date().toISOString()
        }
      })
    );
  }
  
  // Update player2 relationship if exists (always index 2)
  if (player2Id) {
    if (!existingPlayerIds.has(player2Id)) {
      await dynamodbClient!.send(
        new PutCommand({
          TableName: PLAYER_GAMES_TABLE,
          Item: {
            playerId: player2Id,
            gameId: game.gameId,
            playerIndex: 2, // Player 2 is always the joiner
            createdAt: new Date().toISOString()
          }
        })
      );
    } else {
      // Update existing relationship
      await dynamodbClient!.send(
        new PutCommand({
          TableName: PLAYER_GAMES_TABLE,
          Item: {
            playerId: player2Id,
            gameId: game.gameId,
            playerIndex: 2,
            createdAt: new Date().toISOString()
          }
        })
      );
    }
  }
  
  // Remove old player-game relationships that are no longer valid
  // (if player2 was removed or changed)
  const currentPlayerIds = new Set(playerIds);
  for (const existingPlayerId of existingPlayerIds) {
    if (!currentPlayerIds.has(existingPlayerId)) {
      await dynamodbClient!.send(
        new DeleteCommand({
          TableName: PLAYER_GAMES_TABLE,
          Key: {
            playerId: existingPlayerId,
            gameId: game.gameId
          }
        })
      );
    }
  }
}

/**
 * Transform old format (players array) to new format (player1/player2)
 * Ensures consistent player1/player2 structure in all responses
 */
function normalizeGame(item: any): Game | null {
  if (!item) return null;
  
  // Already in correct new format - ensure no players array exists
  if (item.player1 && !item.players) {
    // Remove any stray players property if it exists
    const { players, ...cleanGame } = item;
    return cleanGame as Game;
  }
  
  // Old format with players array - convert to new format
  if (item.players && Array.isArray(item.players)) {
    // Find player1 (index 1 or 0) and player2 (index 2)
    const player1 = item.players.find((p: any) => p.playerIndex === 1 || p.playerIndex === 0);
    const player2 = item.players.find((p: any) => p.playerIndex === 2);
    
    if (!player1) return null; // Invalid data
    
    // Build new format game, explicitly excluding players array
    const normalized: any = {
      gameId: item.gameId,
      status: item.status,
      player1: {
        name: player1.name,
        userId: player1.userId
      },
      player1Id: item.player1Id || player1.userId,
      turnNumber: item.turnNumber,
      createdAt: item.createdAt
    };
    
    // Add player2 if it exists
    if (player2) {
      normalized.player2 = {
        name: player2.name,
        userId: player2.userId
      };
      normalized.player2Id = item.player2Id || player2.userId;
    }
    
    // Copy other fields (updatedAt, etc.)
    if (item.updatedAt) normalized.updatedAt = item.updatedAt;
    
    return normalized as Game;
  }
  
  // Missing both formats - invalid data
  return null;
}

export async function getGame(gameId: string): Promise<Game | undefined> {
  if (useMock) {
    // Local mode: use in-memory storage
    return Promise.resolve(mockStorage.get(gameId));
  }
  
  // Production: use real DynamoDB with AWS SDK v3
  const result = await dynamodbClient!.send(
    new GetCommand({
      TableName: GAMES_TABLE,
      Key: { gameId }
    })
  );
  
  if (!result.Item) return undefined;
  
  // Normalize the game data (handle old format)
  return normalizeGame(result.Item) || undefined;
}

export async function getAllGames(limit?: number, nextToken?: string): Promise<PaginatedResult<Game>> {
  if (useMock) {
    // Local mode: return all games from in-memory storage
    const allGames = Array.from(mockStorage.values());
    const maxLimit = limit || 100;
    const games = allGames.slice(0, maxLimit);
    return {
      items: games,
      hasMore: allGames.length > maxLimit,
      nextToken: allGames.length > maxLimit ? String(maxLimit) : undefined
    };
  }
  
  // Production: scan DynamoDB table with pagination
  const scanLimit = limit || 100; // Default to 100 items per page
  const scanParams: any = {
    TableName: GAMES_TABLE,
    Limit: scanLimit
  };
  
  // If nextToken provided, use it for pagination (LastEvaluatedKey)
  if (nextToken) {
    try {
      scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    } catch (e) {
      // Invalid token, ignore and start from beginning
    }
  }
  
  const result = await dynamodbClient!.send(
    new ScanCommand(scanParams)
  );
  
  const games = (result.Items || [])
    .map(item => normalizeGame(item))
    .filter((game): game is Game => game !== null);
  const hasMore = !!result.LastEvaluatedKey;
  const nextTokenValue = hasMore 
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;
  
  return {
    items: games,
    hasMore,
    nextToken: nextTokenValue
  };
}

export async function getGamesByPlayer(userId: string, limit?: number, nextToken?: string): Promise<PaginatedResult<Game>> {
  if (useMock) {
    // Local mode: use player-games mapping
    const gameIds = Array.from(mockPlayerGames.get(userId) || new Set<string>());
    const allGames = gameIds
      .map(gameId => mockStorage.get(gameId))
      .filter((game): game is Game => !!game);
    
    const maxLimit = limit || 100;
    const games = allGames.slice(0, maxLimit);
    return {
      items: games,
      hasMore: allGames.length > maxLimit,
      nextToken: allGames.length > maxLimit ? String(maxLimit) : undefined
    };
  }
  
  // Production: Query player-games mapping table by playerId with pagination (no scan!)
  const queryLimit = limit || 100;
  const queryParams: any = {
    TableName: PLAYER_GAMES_TABLE,
    KeyConditionExpression: 'playerId = :playerId',
    ExpressionAttributeValues: {
      ':playerId': userId
    },
    Limit: queryLimit
  };
  
  // If nextToken provided, use it for pagination
  if (nextToken) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    } catch (e) {
      // Invalid token, ignore
    }
  }
  
  const playerGamesQuery = await dynamodbClient!.send(
    new QueryCommand(queryParams)
  );
  
  const gameIds = (playerGamesQuery.Items || [])
    .map(item => item.gameId as string)
    .filter((id): id is string => !!id);
  
  if (gameIds.length === 0) {
    return {
      items: [],
      hasMore: !!playerGamesQuery.LastEvaluatedKey,
      nextToken: playerGamesQuery.LastEvaluatedKey 
        ? Buffer.from(JSON.stringify(playerGamesQuery.LastEvaluatedKey)).toString('base64')
        : undefined
    };
  }
  
  // Batch get games using BatchGetItem (DynamoDB allows up to 100 items per batch)
  const batchGetResult = await dynamodbClient!.send(
    new BatchGetCommand({
      RequestItems: {
        [GAMES_TABLE]: {
          Keys: gameIds.map(gameId => ({ gameId }))
        }
      }
    })
  );
  
  const games = (batchGetResult.Responses?.[GAMES_TABLE] || [])
    .map(item => normalizeGame(item))
    .filter((game): game is Game => game !== null);
  const hasMore = !!playerGamesQuery.LastEvaluatedKey;
  const nextTokenValue = hasMore 
    ? Buffer.from(JSON.stringify(playerGamesQuery.LastEvaluatedKey)).toString('base64')
    : undefined;
  
  return {
    items: games,
    hasMore,
    nextToken: nextTokenValue
  };
}

/**
 * Get games created by a specific user as player1 (using GSI on player1Id)
 * More efficient than scanning - uses Query on player1Id-index
 */
export async function getGamesByPlayer1(player1Id: string, limit?: number, nextToken?: string): Promise<PaginatedResult<Game>> {
  if (useMock) {
    // Local mode: filter games by player1Id
    const allGames = Array.from(mockStorage.values()).filter(game => game.player1Id === player1Id || game.player1.userId === player1Id);
    const maxLimit = limit || 100;
    const games = allGames.slice(0, maxLimit);
    return {
      items: games,
      hasMore: allGames.length > maxLimit,
      nextToken: allGames.length > maxLimit ? String(maxLimit) : undefined
    };
  }
  
  // Production: Query GSI by player1Id with pagination (no scan!)
  const queryLimit = limit || 100;
  const queryParams: any = {
    TableName: GAMES_TABLE,
    IndexName: 'player1Id-index',
    KeyConditionExpression: 'player1Id = :player1Id',
    ExpressionAttributeValues: {
      ':player1Id': player1Id
    },
    Limit: queryLimit
  };
  
  // If nextToken provided, use it for pagination
  if (nextToken) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    } catch (e) {
      // Invalid token, ignore
    }
  }
  
  const result = await dynamodbClient!.send(
    new QueryCommand(queryParams)
  );
  
  const games = (result.Items || [])
    .map(item => normalizeGame(item))
    .filter((game): game is Game => game !== null);
  const hasMore = !!result.LastEvaluatedKey;
  const nextTokenValue = hasMore 
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;
  
  return {
    items: games,
    hasMore,
    nextToken: nextTokenValue
  };
}

/**
 * Get games where a specific user is player2 (using GSI on player2Id)
 * More efficient than scanning - uses Query on player2Id-index
 */
/**
 * Delete a game and all player-game relationships
 * This removes the game from the games table and all entries in player_games table
 */
export async function deleteGame(gameId: string): Promise<void> {
  if (useMock) {
    // Local mode: use in-memory storage
    mockStorage.delete(gameId);
    
    // Remove from all player-game mappings
    for (const [playerId, gameIds] of mockPlayerGames.entries()) {
      gameIds.delete(gameId);
      if (gameIds.size === 0) {
        mockPlayerGames.delete(playerId);
      }
    }
    
    return Promise.resolve();
  }
  
  // Production: use real DynamoDB with AWS SDK v3
  // First, get all player-game relationships for this game
  const playerGamesQuery = await dynamodbClient!.send(
    new QueryCommand({
      TableName: PLAYER_GAMES_TABLE,
      IndexName: 'gameId-index',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      }
    })
  );
  
  // Delete all player-game relationships
  if (playerGamesQuery.Items && playerGamesQuery.Items.length > 0) {
    for (const item of playerGamesQuery.Items) {
      await dynamodbClient!.send(
        new DeleteCommand({
          TableName: PLAYER_GAMES_TABLE,
          Key: {
            playerId: item.playerId as string,
            gameId: gameId
          }
        })
      );
    }
  }
  
  // Delete the game itself
  await dynamodbClient!.send(
    new DeleteCommand({
      TableName: GAMES_TABLE,
      Key: { gameId }
    })
  );
}

export async function getGamesByPlayer2(player2Id: string, limit?: number, nextToken?: string): Promise<PaginatedResult<Game>> {
  if (useMock) {
    // Local mode: filter games by player2Id
    const allGames = Array.from(mockStorage.values()).filter(game => game.player2Id === player2Id || game.player2?.userId === player2Id);
    const maxLimit = limit || 100;
    const games = allGames.slice(0, maxLimit);
    return {
      items: games,
      hasMore: allGames.length > maxLimit,
      nextToken: allGames.length > maxLimit ? String(maxLimit) : undefined
    };
  }
  
  // Production: Query GSI by player2Id with pagination (no scan!)
  const queryLimit = limit || 100;
  const queryParams: any = {
    TableName: GAMES_TABLE,
    IndexName: 'player2Id-index',
    KeyConditionExpression: 'player2Id = :player2Id',
    ExpressionAttributeValues: {
      ':player2Id': player2Id
    },
    Limit: queryLimit
  };
  
  // If nextToken provided, use it for pagination
  if (nextToken) {
    try {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    } catch (e) {
      // Invalid token, ignore
    }
  }
  
  const result = await dynamodbClient!.send(
    new QueryCommand(queryParams)
  );
  
  const games = (result.Items || [])
    .map(item => normalizeGame(item))
    .filter((game): game is Game => game !== null);
  const hasMore = !!result.LastEvaluatedKey;
  const nextTokenValue = hasMore 
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;
  
  return {
    items: games,
    hasMore,
    nextToken: nextTokenValue
  };
}
