# API Testing Guide

This guide explains how to test the Syniad API using bash scripts with curl and jq.

## Prerequisites

1. **AWS CLI** installed and configured with credentials
2. **curl** (usually pre-installed on macOS/Linux)
3. **jq** installed: `brew install jq` (macOS) or `apt-get install jq` (Linux)
4. **Cognito User Pool** deployed (get values from Terraform outputs)

## Running Scripts in VS Code/Cursor

### Option 1: Code Runner Extension (Recommended)

Install the **Code Runner** extension to run scripts with a button click:

1. **Install Code Runner**:
   - Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)
   - Search for **"Code Runner"** by Jun Han
   - Extension ID: `formulahendry.code-runner`
   - Click **Install**

2. **Run scripts**:
   - Open any `.sh` file (e.g., `api-tests/test.sh`)
   - Click the **▶ Run Code** button (top right of editor)
   - Or press `Ctrl+Alt+N` (Windows/Linux) or `Cmd+Alt+N` (Mac)
   - Output appears in the integrated terminal

### Option 2: Integrated Terminal

Or use the built-in terminal (no extension needed):

1. Press `` Ctrl+` `` (backtick) to open terminal
2. Run: `./api-tests/test.sh`

### Optional: ShellCheck Extension

For syntax checking and linting:
- Search for **"ShellCheck"** in Extensions
- Provides error checking and warnings for bash scripts

## Quick Start

### Step 1: Get Your API Credentials

Run the helper script to create a test user and get your authentication token:

```bash
./scripts/test-cognito-auth.sh
```

The script will:
- Create/update a test user in Cognito
- Get an authentication token
- Automatically populate your `.env` file with the token and API URL

### Step 2: Test the API

All test scripts automatically source the `.env` file to load credentials:

```bash
# Test endpoint
./api-tests/test.sh

# Create a game
./api-tests/create-game.sh "My Player Name"

# Get game details (gameId from create-game.sh output)
./api-tests/get-game.sh <gameId>

# Join a game
./api-tests/join-game.sh <gameId> "Second Player"

# Chained workflow: create then join automatically
./api-tests/create-and-join-game.sh "Player 1" "Player 2"
```

## Available Scripts

### `test.sh` - Test Endpoint
Verifies authentication works:

```bash
./api-tests/test.sh
```

### `create-game.sh` - Create a Game
Creates a new game and returns the gameId:

```bash
./api-tests/create-game.sh [playerName]
```

If `playerName` is not provided, defaults to "Test Player".

**Output:** Displays the gameId. You can update `.env` with:
```bash
sed -i '' 's/^GAME_ID=.*/GAME_ID=<gameId>/' .env
```

### `get-game.sh` - Get Game Details
Retrieves game details:

```bash
./api-tests/get-game.sh [gameId]
```

If `gameId` is not provided, uses `GAME_ID` from `.env` file.

### `join-game.sh` - Join a Game
Joins an existing game:

```bash
./api-tests/join-game.sh [gameId] [playerName]
```

If `gameId` is not provided, uses `GAME_ID` from `.env` file.
If `playerName` is not provided, defaults to "Second Player".

### `create-and-join-game.sh` - Chained Workflow
Creates a game and automatically joins it:

```bash
./api-tests/create-and-join-game.sh [player1Name] [player2Name]
```

This demonstrates chaining: creates a game, extracts the gameId, then joins it automatically.

## How It Works

1. **Authentication script** (`test-cognito-auth.sh`) writes credentials to `.env` file (gitignored)
2. **All test scripts** automatically source the `.env` file at the start
3. **Scripts use curl** to make HTTP requests with the loaded credentials
4. **jq** formats JSON responses for readability

**Security:**
- `.env` file is **gitignored** (contains tokens) - never commit it!
- All scripts are **safe to commit** (they source .env, no tokens stored)
- Variables are loaded fresh from `.env` on every script run (no caching!)

## Testing with Multiple Users

To test multiplayer functionality:

1. **Create User 1**:
   ```bash
   ./scripts/test-cognito-auth.sh
   ```
   Use email: `player1@example.com`

2. **Create Game** with User 1's token:
   ```bash
   ./api-tests/create-game.sh "Player 1"
   ```
   Note the `gameId` from the output.

3. **Create User 2** (run script again):
   ```bash
   ./scripts/test-cognito-auth.sh
   ```
   Use email: `player2@example.com`
   
   The script automatically updates `.env` with User 2's token.

4. **Join Game** with User 2's token:
   ```bash
   ./api-tests/join-game.sh <gameId> "Player 2"
   ```

## Token Expiration

Cognito ID tokens expire after 24 hours. When you get a `401 Unauthorized`:

1. Run the script again:
   ```bash
   ./scripts/test-cognito-auth.sh
   ```

2. The script automatically updates `.env` with the new token

3. All scripts will use the new token immediately (they source .env on every run)

## Troubleshooting

**Getting 401 Unauthorized?**
- Token may have expired - run `./scripts/test-cognito-auth.sh` to get a new token
- Check that `.env` file exists and contains `ID_TOKEN`

**Getting 403 Forbidden?**
- Token might be invalid - get a fresh token
- Check that the route is properly configured

**Scripts not finding .env file?**
- Make sure you're running scripts from the project root
- Run `./scripts/test-cognito-auth.sh` first to create the `.env` file

**jq not found?**
- Install jq: `brew install jq` (macOS) or `apt-get install jq` (Linux)
- Scripts will still work without jq, but JSON won't be formatted

**CORS errors?**
- Check that your `cors_allowed_origins` in Terraform includes your origin
- For local testing, ensure `http://localhost:*` is included