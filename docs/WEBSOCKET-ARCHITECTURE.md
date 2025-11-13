# WebSocket Architecture for Real-Time Game Play

## Overview

This document outlines the architecture for implementing real-time multiplayer game functionality using AWS API Gateway WebSocket API.

## Architecture Components

### 1. AWS API Gateway WebSocket API
- **Purpose**: Provides WebSocket connections for real-time bidirectional communication
- **Routes**:
  - `$connect`: Handle new WebSocket connections
  - `$disconnect`: Handle WebSocket disconnections
  - `$default`: Handle all other messages (game actions, state updates)

### 2. Lambda Functions

#### WebSocket Connect Handler
- **Function**: `websocket-connect`
- **Purpose**: 
  - Authenticate user via Cognito token
  - Validate game access (user must be player1 or player2)
  - Store connection in DynamoDB
  - Send connection confirmation

#### WebSocket Disconnect Handler
- **Function**: `websocket-disconnect`
- **Purpose**:
  - Remove connection from DynamoDB
  - Notify other player of disconnection (if game is active)

#### WebSocket Message Handler
- **Function**: `websocket-message`
- **Purpose**:
  - Parse incoming messages
  - Validate game state and player turn
  - Update game state in DynamoDB if valid
  - Retrieve all active connections for the game
  - Broadcast updated state to ALL players (including the original sender)
- **Flow**:
  1. Receive action from client (e.g., move unit, select hex)
  2. Validate action (game exists, player's turn, action is legal)
  3. Update game state in DynamoDB
  4. Query all connections for this game
  5. Send updated game state to all connected players

### 3. DynamoDB Tables

#### WebSocket Connections Table
- **Table Name**: `syniad-{env}-websocket-connections`
- **Partition Key**: `connectionId` (string)
- **Attributes**:
  - `gameId` (string, GSI)
  - `userId` (string, GSI)
  - `playerIndex` (number: 1 or 2)
  - `connectedAt` (string, ISO timestamp)
  - `lastActivity` (string, ISO timestamp)

#### Game State Table (Enhanced)
- **Table Name**: `syniad-{env}-games` (existing)
- **Additional Attributes**:
  - `currentTurn` (number: 1 or 2)
  - `gameState` (map: current game state including unit positions, etc.)

### 4. Message Protocol

#### Client → Server Messages

```typescript
// Join game room
{
  action: "join",
  gameId: string
}

// Send chat message
{
  action: "chat",
  gameId: string,
  message: string,
  player: string
}

// Move unit
{
  action: "moveUnit",
  gameId: string,
  unitId: string,
  fromHex: { row: number, column: number },
  toHex: { row: number, column: number }
}

// End turn
{
  action: "endTurn",
  gameId: string
}

// Select unit
{
  action: "selectUnit",
  gameId: string,
  unitId: string
}
```

#### Server → Client Messages

```typescript
// Chat message
{
  type: "chat",
  gameId: string,
  player: string,
  message: string,
  timestamp: string
}

// Game state update
{
  type: "gameStateUpdate",
  gameId: string,
  gameState: GameState,
  currentTurn: number
}

// Player joined
{
  type: "playerJoined",
  gameId: string,
  player: Player
}

// Player disconnected
{
  type: "playerDisconnected",
  gameId: string,
  playerIndex: number
}

// Error
{
  type: "error",
  message: string,
  code?: string
}
```

## Game State Update Flow

### Standard Flow
1. **User Action**: Player clicks map board or performs action (move unit, select hex, etc.)
2. **Client Processing**: Frontend validates action locally and sends message to WebSocket
3. **Server Processing**: 
   - WebSocket message handler receives the action
   - Validates game state, player turn, and action legality
   - Updates game state in DynamoDB if valid
   - Retrieves all active connections for the game
4. **Broadcast**: Updated game state is broadcast to ALL players (including the original user)
5. **Client Update**: All clients receive the update and refresh their UI

### Benefits of Broadcasting to All Players
- **Consistency**: Original user sees the same state as other players
- **Feedback**: Original user gets confirmation that action was processed
- **Resilience**: If original user's connection had issues, they still get the update
- **Simplicity**: Single code path for state updates

## Implementation Plan

### Phase 1: Infrastructure Setup
1. Create Terraform configuration for WebSocket API Gateway
2. Create DynamoDB table for WebSocket connections
3. Create Lambda functions for WebSocket handlers
4. Set up IAM roles and permissions

### Phase 2: Connection Management
1. Implement WebSocket connect handler
2. Implement WebSocket disconnect handler
3. Add connection tracking in DynamoDB
4. Test connection lifecycle

### Phase 3: Message Handling
1. Implement WebSocket message handler
2. Add message validation and routing
3. Implement game state updates in DynamoDB
4. Implement broadcast to all connected players (including sender)
5. Add error handling and validation

### Phase 4: Client Integration
1. Add WebSocket client to GameClient component
2. Implement connection management
3. Add message sending for game actions
4. Add message receiving and UI updates
5. Handle reconnection logic

## Security Considerations

1. **Authentication**: All WebSocket connections must be authenticated via Cognito
2. **Authorization**: Users can only connect to games where they are player1 or player2
3. **Message Validation**: All incoming messages must be validated
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **Connection Limits**: Limit connections per user/game

## Cost Considerations

- WebSocket API Gateway: $0.25 per million messages
- Lambda: Pay per invocation
- DynamoDB: Pay per read/write
- Data transfer: Standard AWS data transfer costs

## Next Steps

1. Create Terraform configuration for WebSocket API
2. Implement Lambda handlers
3. Add WebSocket client to frontend
4. Test end-to-end flow

