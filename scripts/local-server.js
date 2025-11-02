#!/usr/bin/env node

/**
 * Simple local server for testing Lambda handlers
 * Simulates API Gateway events locally
 * Uses mock DynamoDB (handled in lib/db.ts when LOCAL_MODE=true)
 */

const http = require('http');
const { URL } = require('url');
const path = require('path');

// Set environment for local testing
process.env.GAMES_TABLE = 'wargame-games-local';
process.env.LOCAL_MODE = 'true';

// Import handlers (compiled JavaScript)
let testHandler, createGameHandler, joinGameHandler, getGameHandler;
try {
  testHandler = require(path.join(__dirname, '../.build/handlers/test')).handler;
  createGameHandler = require(path.join(__dirname, '../.build/handlers/createGame')).handler;
  joinGameHandler = require(path.join(__dirname, '../.build/handlers/joinGame')).handler;
  getGameHandler = require(path.join(__dirname, '../.build/handlers/getGame')).handler;
} catch (error) {
  console.error('\n❌ Error loading handlers.');
  console.error('   Make sure to run: npm run build\n');
  console.error('   Error:', error.message);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// Mock API Gateway event
function createMockEvent(method, pathname, body = null, pathParams = null) {
  return {
    httpMethod: method,
    path: pathname,
    pathParameters: pathParams,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    requestContext: {
      requestId: 'local-' + Date.now(),
      accountId: '123456789012',
      apiId: 'local',
      stage: 'local',
      httpMethod: method,
      path: pathname,
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now()
    }
  };
}

// Mock API Gateway context
function createMockContext() {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'local-test',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:local-test',
    memoryLimitInMB: '256',
    awsRequestId: 'local-' + Date.now(),
    logGroupName: '/aws/lambda/local-test',
    logStreamName: '2024/01/01/[$LATEST]local',
    getRemainingTimeInMillis: () => 30000
  };
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // Read request body
    let body = null;
    if (method === 'POST' || method === 'PUT') {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch {
            resolve(data || null);
          }
        });
      });
    }

    // Parse path parameters
    let pathParams = null;
    const joinGameMatch = pathname.match(/^\/games\/([^\/]+)\/join$/);
    const getGameMatch = pathname.match(/^\/games\/([^\/]+)$/);
    
    if (joinGameMatch && method === 'POST') {
      pathParams = { gameId: joinGameMatch[1] };
    } else if (getGameMatch && method === 'GET') {
      pathParams = { gameId: getGameMatch[1] };
    }
    
    // Create mock event and context
    const event = createMockEvent(method, pathname, body, pathParams);
    const context = createMockContext();
    
    // Route to appropriate handler
    let result;
    if (pathname === '/test' && method === 'GET') {
      result = await testHandler(event, context);
    } else if (pathname === '/games' && method === 'POST') {
      result = await createGameHandler(event, context);
    } else if (joinGameMatch && method === 'POST') {
      result = await joinGameHandler(event, context);
    } else if (getGameMatch && method === 'GET') {
      result = await getGameHandler(event, context);
    } else {
      result = {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found', path: pathname, method })
      };
    }

    // Send response
    res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
    res.end(result.body || JSON.stringify({ message: 'No response body' }));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: error.message,
      ...(process.env.DEBUG && { stack: error.stack })
    }));
  }
});

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Local Development Server');
  console.log('='.repeat(50));
  console.log(`\n📍 Server: http://localhost:${PORT}`);
  console.log('\n📝 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/test`);
  console.log(`   POST http://localhost:${PORT}/games`);
  console.log(`   GET  http://localhost:${PORT}/games/{gameId}`);
  console.log(`   POST http://localhost:${PORT}/games/{gameId}/join`);
  console.log('\n💡 Using in-memory mock DynamoDB');
  console.log('   (Data persists only while server is running)');
  console.log('\n💻 Test commands:');
  console.log(`   curl http://localhost:${PORT}/test`);
  console.log(`   curl -X POST http://localhost:${PORT}/games \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"playerName": "TestPlayer"}'`);
  console.log(`   curl -X POST http://localhost:${PORT}/games/{gameId}/join \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"playerName": "Player2"}'`);
  console.log('\nPress Ctrl+C to stop\n');
});
