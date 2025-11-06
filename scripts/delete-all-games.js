#!/usr/bin/env node

/**
 * Script to delete all games for the authenticated user
 * Usage: node scripts/delete-all-games.js
 * 
 * Requires:
 * - API_URL environment variable (or defaults to https://dev.api.syniad.net)
 * - ID_TOKEN environment variable (get from ./scripts/test-cognito-auth.sh)
 * 
 * The script will also try to load values from .env file if environment variables are not set.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Try to load from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          // Remove quotes if present
          env[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    });
    return env;
  }
  return {};
}

const envFile = loadEnvFile();
const API_URL = process.env.API_URL || envFile.API_URL || 'https://dev.api.syniad.net';
const ID_TOKEN = process.env.ID_TOKEN || envFile.ID_TOKEN;

if (!ID_TOKEN) {
  console.error('Error: ID_TOKEN environment variable is required');
  console.error('Run: ./scripts/test-cognito-auth.sh');
  console.error('Or set: export ID_TOKEN="your-token-here"');
  process.exit(1);
}

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${ID_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Get all games with pagination
async function getAllGames() {
  const allGames = [];
  let nextToken = null;
  let page = 1;

  do {
    console.log(`Fetching games page ${page}...`);
    const path = nextToken 
      ? `/games?limit=100&nextToken=${encodeURIComponent(nextToken)}`
      : '/games?limit=100';
    
    const response = await makeRequest('GET', path);
    
    if (response.status !== 200) {
      console.error(`Error fetching games:`, response.data);
      throw new Error(`Failed to fetch games: ${response.status}`);
    }

    const games = response.data.games || [];
    allGames.push(...games);
    
    nextToken = response.data.nextToken;
    page++;
    
    console.log(`  Found ${games.length} games on this page (total: ${allGames.length})`);
  } while (nextToken);

  return allGames;
}

// Delete a single game
async function deleteGame(gameId) {
  const response = await makeRequest('DELETE', `/games/${gameId}`);
  return response;
}

// Main function
async function main() {
  console.log('Fetching all games...');
  console.log(`API URL: ${API_URL}`);
  console.log('');

  try {
    const games = await getAllGames();
    console.log(`\nFound ${games.length} total games`);
    
    if (games.length === 0) {
      console.log('No games to delete.');
      return;
    }

    console.log('\nDeleting games...');
    let deleted = 0;
    let failed = 0;
    let forbidden = 0;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const gameId = game.gameId;
      
      process.stdout.write(`[${i + 1}/${games.length}] Deleting ${gameId}... `);
      
      try {
        const response = await deleteGame(gameId);
        
        if (response.status === 200) {
          console.log('✓ Deleted');
          deleted++;
        } else if (response.status === 403) {
          console.log('✗ Forbidden (not the creator)');
          forbidden++;
        } else if (response.status === 404) {
          console.log('✗ Not found (already deleted?)');
          failed++;
        } else {
          console.log(`✗ Error: ${response.status} - ${JSON.stringify(response.data)}`);
          failed++;
        }
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        failed++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total games: ${games.length}`);
    console.log(`Deleted: ${deleted}`);
    console.log(`Forbidden: ${forbidden}`);
    console.log(`Failed: ${failed}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

