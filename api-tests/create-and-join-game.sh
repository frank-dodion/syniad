#!/bin/bash
# Create and Join Game Workflow - Chained workflow
# Creates a game, extracts gameId, then joins it automatically
# Loads credentials from .env file (sourced automatically)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.api-test"

# Source .env.api-test file to load credentials
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "Error: .env.api-test file not found. Run ./scripts/test-cognito-auth.sh first."
    exit 1
fi

# Check required variables
if [ -z "$API_URL" ] || [ -z "$ID_TOKEN" ]; then
    echo "Error: API_URL or ID_TOKEN not set in .env.api-test file."
    echo "Run ./scripts/test-cognito-auth.sh to generate credentials."
    exit 1
fi

# Get player names from arguments or use defaults
PLAYER1_NAME="${1:-Test Player}"
PLAYER2_NAME="${2:-Second Player}"

echo "=== Step 1: Create Game ==="
echo ""

# Create game
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"playerName\": \"$PLAYER1_NAME\"}" \
    "$API_URL/games")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" != "200" ]; then
    echo "Error creating game: HTTP $http_code"
    echo "$body"
    exit 1
fi

echo "✓ Game created!"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

# Extract gameId
gameId=$(echo "$body" | jq -r '.gameId // .game.gameId // empty' 2>/dev/null)

if [ -z "$gameId" ] || [ "$gameId" = "null" ]; then
    echo "Error: Could not extract gameId from response"
    exit 1
fi

echo "GameId: $gameId"
echo ""
echo "=== Step 2: Join Game ==="
echo ""

# Join game
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"playerName\": \"$PLAYER2_NAME\"}" \
    "$API_URL/games/$gameId/join")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" != "200" ]; then
    echo "Error joining game: HTTP $http_code"
    echo "$body"
    exit 1
fi

echo "✓ Successfully joined game!"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""
echo "✓ Complete workflow successful!"
