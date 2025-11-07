#!/bin/bash
# Join Game - Join an existing game
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

# Get gameId from argument or .env file
GAME_ID="${1:-$GAME_ID}"

if [ -z "$GAME_ID" ] || [ "$GAME_ID" = "paste-game-id-here" ]; then
    echo "Error: GAME_ID not set."
    echo "Usage: $0 <gameId> [playerName]"
    echo "Or set GAME_ID in .env.api-test file"
    exit 1
fi

# Get player name from argument or use default
PLAYER_NAME="${2:-Second Player}"

# Make request
echo "Joining game: $GAME_ID as $PLAYER_NAME"
echo "POST $API_URL/games/$GAME_ID/join"
echo ""

response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"playerName\": \"$PLAYER_NAME\"}" \
    "$API_URL/games/$GAME_ID/join")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
