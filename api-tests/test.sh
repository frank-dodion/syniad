#!/bin/bash
# Test Endpoint - Verify authentication works
# Loads credentials from .env file (sourced automatically)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Source .env file to load credentials
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "Error: .env file not found. Run ./scripts/test-cognito-auth.sh first."
    exit 1
fi

# Check required variables
if [ -z "$API_URL" ] || [ -z "$ID_TOKEN" ]; then
    echo "Error: API_URL or ID_TOKEN not set in .env file."
    echo "Run ./scripts/test-cognito-auth.sh to generate credentials."
    exit 1
fi

# Make request
echo "Testing endpoint: $API_URL/test"
echo ""

response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $ID_TOKEN" \
    "$API_URL/test")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
