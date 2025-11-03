import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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

export async function saveGame(game: Game): Promise<void> {
  // Extract player userIds from player1 and player2
  const playerIds: string[] = [game.player1.userId];
  if (game.player2) {
    playerIds.push(game.player2.userId);
  }
  
  // Ensure creatorId is set (always player1.userId)
  const creatorId = game.creatorId || game.player1.userId;
  
  // Update game with creatorId
  const gameWithIndex: Game = {
    ...game,
    creatorId: creatorId
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
  
  return result.Item as Game | undefined;
}

export async function getAllGames(): Promise<Game[]> {
  if (useMock) {
    // Local mode: return all games from in-memory storage
    return Array.from(mockStorage.values());
  }
  
  // Production: scan DynamoDB table (returns all games)
  // Note: For large tables, consider pagination
  const result = await dynamodbClient!.send(
    new ScanCommand({
      TableName: GAMES_TABLE
    })
  );
  
  return (result.Items || []) as Game[];
}

export async function getGamesByPlayer(userId: string): Promise<Game[]> {
  if (useMock) {
    // Local mode: use player-games mapping
    const gameIds = mockPlayerGames.get(userId) || new Set<string>();
    return Array.from(gameIds)
      .map(gameId => mockStorage.get(gameId))
      .filter((game): game is Game => !!game);
  }
  
  // Production: Query player-games mapping table by playerId (no scan!)
  const playerGamesQuery = await dynamodbClient!.send(
    new QueryCommand({
      TableName: PLAYER_GAMES_TABLE,
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: {
        ':playerId': userId
      }
    })
  );
  
  const gameIds = (playerGamesQuery.Items || [])
    .map(item => item.gameId as string)
    .filter((id): id is string => !!id);
  
  if (gameIds.length === 0) {
    return [];
  }
  
  // Batch get games using BatchGetItem (DynamoDB allows up to 100 items per batch)
  // Split into batches of 100 if needed
  const games: Game[] = [];
  const batchSize = 100;
  
  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const batchGetResult = await dynamodbClient!.send(
      new BatchGetCommand({
        RequestItems: {
          [GAMES_TABLE]: {
            Keys: batch.map(gameId => ({ gameId }))
          }
        }
      })
    );
    
    const batchGames = (batchGetResult.Responses?.[GAMES_TABLE] || []) as Game[];
    games.push(...batchGames);
  }
  
  return games;
}

/**
 * Get games created by a specific user (using GSI on creatorId)
 * More efficient than scanning - uses Query on creatorId-index
 */
export async function getGamesByCreator(creatorId: string): Promise<Game[]> {
  if (useMock) {
    // Local mode: filter games by creatorId
    return Array.from(mockStorage.values()).filter(game => game.creatorId === creatorId);
  }
  
  // Production: Query GSI by creatorId (no scan!)
  const result = await dynamodbClient!.send(
    new QueryCommand({
      TableName: GAMES_TABLE,
      IndexName: 'creatorId-index',
      KeyConditionExpression: 'creatorId = :creatorId',
      ExpressionAttributeValues: {
        ':creatorId': creatorId
      }
    })
  );
  
  return (result.Items || []) as Game[];
}
