#!/bin/bash
# Create Game - Creates a new game and returns gameId
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

# Debug: Show token info (without exposing full token)
TOKEN_LENGTH=${#ID_TOKEN}
TOKEN_PREVIEW="${ID_TOKEN:0:20}...${ID_TOKEN: -20}"
echo "DEBUG: Token loaded - Length: $TOKEN_LENGTH, Preview: $TOKEN_PREVIEW"
echo "DEBUG: API_URL: $API_URL"
echo ""

# Get player name from argument or use default
PLAYER_NAME="${1:-Test Player}"

# Make request
echo "Creating game with player: $PLAYER_NAME"
echo "POST $API_URL/games"
echo ""

# Debug: Show exact Authorization header (first/last chars only)
AUTH_HEADER="Bearer $ID_TOKEN"
AUTH_PREVIEW="${AUTH_HEADER:0:30}...${AUTH_HEADER: -30}"
echo "DEBUG: Authorization header preview: $AUTH_PREVIEW"
echo ""

# Make request with verbose output to stderr, response to stdout
response=$(curl -v -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"playerName\": \"$PLAYER_NAME\"}" \
    "$API_URL/games" 2>/tmp/create_game_curl.log)

# Extract HTTP code (last line)
http_code=$(echo "$response" | tail -n1)

# Extract body (everything except last line)
body=$(echo "$response" | sed '$d')

# Show curl verbose output for debugging (Authorization header and HTTP status)
if [ -f /tmp/create_game_curl.log ]; then
    echo "DEBUG: Curl verbose output (key parts):"
    grep -i "> Authorization:" /tmp/create_game_curl.log | head -1
    grep -i "< HTTP" /tmp/create_game_curl.log | head -1
    echo ""
fi

echo "HTTP Status: $http_code"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

# Extract gameId if successful
if [ "$http_code" = "200" ]; then
    gameId=$(echo "$body" | jq -r '.gameId // .game.gameId // empty' 2>/dev/null)
    if [ -n "$gameId" ] && [ "$gameId" != "null" ]; then
        echo ""
        echo "✓ Game created! GameId: $gameId"
        echo ""
        echo "To update .env.api-test with this gameId, run:"
        echo "  sed -i '' 's/^GAME_ID=.*/GAME_ID=$gameId/' $ENV_FILE"
    fi
fi
