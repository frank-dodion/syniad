#!/usr/bin/env node

/**
 * Script to delete ALL games directly from DynamoDB
 * 
 * Usage:
 *   # For dev environment (default):
 *   node scripts/delete-all-games-dynamodb.js
 * 
 *   # For prod environment:
 *   ENV=prod node scripts/delete-all-games-dynamodb.js
 *   # OR
 *   GAMES_TABLE=syniad-prod-games PLAYER_GAMES_TABLE=syniad-prod-player-games node scripts/delete-all-games-dynamodb.js
 * 
 * Requires:
 * - AWS credentials configured (via AWS CLI, environment variables, or IAM role)
 * - Set ENV=prod for production, or defaults to dev
 * - Can override with GAMES_TABLE and PLAYER_GAMES_TABLE environment variables
 * 
 * WARNING: This deletes ALL games regardless of creator. Use with caution!
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// Determine environment
const ENV = process.env.ENV || 'dev';
const envSuffix = ENV === 'prod' ? 'prod' : 'dev';

// Get table names from environment variables or use defaults based on ENV
const GAMES_TABLE = process.env.GAMES_TABLE || `syniad-${envSuffix}-games`;
const PLAYER_GAMES_TABLE = process.env.PLAYER_GAMES_TABLE || `syniad-${envSuffix}-player-games`;

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Scan all games from DynamoDB
async function scanAllGames() {
  const allGames = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: GAMES_TABLE
    };
    
    // Only include ExclusiveStartKey if it exists
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    console.log(`Scanning games table... (found ${allGames.length} so far)`);
    const result = await dynamoClient.send(new ScanCommand(params));
    
    if (result.Items) {
      allGames.push(...result.Items);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allGames;
}

// Delete all player-game relationships for a game
async function deletePlayerGameRelationships(gameId) {
  // Query player-games table by gameId
  const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
  
  let lastEvaluatedKey = null;
  const itemsToDelete = [];

  do {
    const queryParams = {
      TableName: PLAYER_GAMES_TABLE,
      IndexName: 'gameId-index',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      }
    };
    
    // Only include ExclusiveStartKey if it exists
    if (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    const result = await dynamoClient.send(new QueryCommand(queryParams));

    if (result.Items) {
      itemsToDelete.push(...result.Items.map(item => ({
        DeleteRequest: {
          Key: {
            playerId: item.playerId,
            gameId: item.gameId
          }
        }
      })));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Batch delete player-game relationships
  if (itemsToDelete.length > 0) {
    // BatchWriteCommand can handle up to 25 items at a time
    for (let i = 0; i < itemsToDelete.length; i += 25) {
      const batch = itemsToDelete.slice(i, i + 25);
      await dynamoClient.send(new BatchWriteCommand({
        RequestItems: {
          [PLAYER_GAMES_TABLE]: batch
        }
      }));
    }
  }

  return itemsToDelete.length;
}

// Delete a single game
async function deleteGame(gameId) {
  // First delete player-game relationships
  const relationshipCount = await deletePlayerGameRelationships(gameId);
  
  // Then delete the game itself
  await dynamoClient.send(new DeleteCommand({
    TableName: GAMES_TABLE,
    Key: { gameId }
  }));

  return relationshipCount;
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('DELETE ALL GAMES FROM DYNAMODB');
  console.log('='.repeat(60));
  console.log(`Environment: ${ENV.toUpperCase()}`);
  console.log(`Games Table: ${GAMES_TABLE}`);
  console.log(`Player Games Table: ${PLAYER_GAMES_TABLE}`);
  console.log('');
  
  if (ENV === 'prod') {
    console.log('⚠️  ⚠️  ⚠️  PRODUCTION ENVIRONMENT ⚠️  ⚠️  ⚠️');
    console.log('WARNING: This will delete ALL games in PRODUCTION!');
    console.log('');
  } else {
    console.log('WARNING: This will delete ALL games regardless of creator!');
    console.log('');
  }

  try {
    // Scan all games
    console.log('Scanning for all games...');
    const games = await scanAllGames();
    console.log(`Found ${games.length} total games\n`);

    if (games.length === 0) {
      console.log('No games to delete.');
      return;
    }

    // Confirm deletion
    console.log('Games to delete:');
    games.slice(0, 10).forEach((game, i) => {
      console.log(`  ${i + 1}. ${game.gameId} - ${game.title || 'Untitled'}`);
    });
    if (games.length > 10) {
      console.log(`  ... and ${games.length - 10} more`);
    }
    console.log('');

    // Delete games
    console.log('Deleting games and player-game relationships...');
    let deleted = 0;
    let failed = 0;
    let totalRelationships = 0;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const gameId = game.gameId;
      
      process.stdout.write(`[${i + 1}/${games.length}] Deleting ${gameId}... `);
      
      try {
        const relationshipCount = await deleteGame(gameId);
        totalRelationships += relationshipCount;
        console.log(`✓ Deleted (${relationshipCount} relationships)`);
        deleted++;
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total games found: ${games.length}`);
    console.log(`Games deleted: ${deleted}`);
    console.log(`Player-game relationships deleted: ${totalRelationships}`);
    console.log(`Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

