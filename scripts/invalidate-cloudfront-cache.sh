#!/bin/bash

# Invalidate CloudFront cache for API routes
# Usage: ./scripts/invalidate-cloudfront-cache.sh [stage]
# Default stage: dev

set -e

STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Invalidating CloudFront cache...${NC}"

cd "$PROJECT_ROOT/terraform"

# Get CloudFront distribution ID
DISTRIBUTION_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")

if [ -z "$DISTRIBUTION_ID" ]; then
  echo -e "${YELLOW}Warning: Could not get CloudFront distribution ID from Terraform outputs${NC}"
  echo -e "${YELLOW}Attempting to find distribution by alias...${NC}"
  
  # Try to get it from AWS directly
  if [ "$STAGE" = "dev" ]; then
    DOMAIN_NAME="dev.syniad.net"
  elif [ "$STAGE" = "prod" ]; then
    DOMAIN_NAME="syniad.net"
  else
    DOMAIN_NAME="${STAGE}.syniad.net"
  fi
  
  DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?@=='${DOMAIN_NAME}']].Id" --output text 2>/dev/null || echo "")
fi

if [ -z "$DISTRIBUTION_ID" ]; then
  echo -e "${RED}✗ Could not find CloudFront distribution${NC}"
  exit 1
fi

echo -e "${GREEN}Found distribution: ${DISTRIBUTION_ID}${NC}"

# Invalidate API paths and root
PATHS=(
  "/api/*"
  "/"
)

echo -e "${YELLOW}Creating invalidation for paths: ${PATHS[*]}${NC}"

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "${PATHS[@]}" \
  --query 'Invalidation.Id' \
  --output text 2>/dev/null)

if [ -n "$INVALIDATION_ID" ]; then
  echo -e "${GREEN}✓ Invalidation created: ${INVALIDATION_ID}${NC}"
  echo -e "${YELLOW}Note: CloudFront invalidations typically take 1-2 minutes to complete${NC}"
else
  echo -e "${RED}✗ Failed to create invalidation${NC}"
  exit 1
fi

