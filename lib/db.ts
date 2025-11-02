import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Game } from '../shared/types';

// In-memory storage for local testing
const mockStorage: Map<string, Game> = new Map();

const GAMES_TABLE = process.env.GAMES_TABLE || '';
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
  if (useMock) {
    // Local mode: use in-memory storage
    mockStorage.set(game.gameId, game);
    return Promise.resolve();
  }
  
  // Production: use real DynamoDB with AWS SDK v3
  await dynamodbClient!.send(
    new PutCommand({
      TableName: GAMES_TABLE,
      Item: game
    })
  );
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

