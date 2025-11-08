#!/bin/bash

# Test Lambda Function URL directly (bypassing CloudFront)
# Usage: ./scripts/test-lambda-function-url.sh [stage] [token]
# Default stage: dev

set -e

STAGE=${1:-dev}
TOKEN=${2:-""}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing Lambda Function URL directly...${NC}"
echo ""

cd "$PROJECT_ROOT/terraform"

# Get Lambda Function URL
FUNCTION_URL=$(terraform output -raw game_lambda_function_url 2>/dev/null || echo "")

if [ -z "$FUNCTION_URL" ]; then
  echo -e "${RED}✗ Could not get Lambda Function URL from Terraform outputs${NC}"
  exit 1
fi

echo -e "${GREEN}Function URL: ${FUNCTION_URL}${NC}"
echo ""

# Test 1: Simple GET request
echo -e "${YELLOW}Test 1: GET /api/scenarios (no auth)${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${FUNCTION_URL}api/scenarios" || echo "HTTP_CODE:000")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Request reached Lambda (HTTP ${HTTP_CODE})${NC}"
  echo "Response: ${BODY:0:200}..."
else
  echo -e "${RED}✗ Request failed (HTTP ${HTTP_CODE})${NC}"
  echo "Response: $BODY"
fi
echo ""

# Test 2: POST request with token (if provided)
if [ -n "$TOKEN" ]; then
  echo -e "${YELLOW}Test 2: POST /api/scenarios (with Bearer token)${NC}"
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d '{"name":"Test Scenario","description":"Test"}' \
    "${FUNCTION_URL}api/scenarios" || echo "HTTP_CODE:000")
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ Request reached Lambda (HTTP ${HTTP_CODE})${NC}"
    echo "Response: ${BODY:0:200}..."
  else
    echo -e "${RED}✗ Request failed (HTTP ${HTTP_CODE})${NC}"
    echo "Response: $BODY"
  fi
  echo ""
else
  echo -e "${YELLOW}Test 2: Skipped (no token provided)${NC}"
  echo "To test with auth, run: $0 $STAGE <your-token>"
  echo ""
fi

echo -e "${BLUE}Testing complete${NC}"

