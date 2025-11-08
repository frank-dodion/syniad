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

# Select the correct workspace before reading outputs
if [ "$STAGE" = "dev" ]; then
    echo -e "${YELLOW}Switched to workspace \"dev\".${NC}"
    terraform workspace select dev 2>/dev/null || true
elif [ "$STAGE" = "prod" ]; then
    echo -e "${YELLOW}Switched to workspace \"prod\".${NC}"
    terraform workspace select prod 2>/dev/null || true
fi

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

# Note: CloudFront invalidation is not needed because:
# - API routes (/api/*) use no_cache policy with TTL=0 (not cached)
# - HTML pages (/) use no_cache policy with TTL=0 (not cached)
# - Static assets (/_next/static/*) use hashed filenames (new builds = new filenames)
# 
# Since nothing is cached, invalidation is unnecessary and would be wasteful.
# If you need to force refresh, users can do a hard refresh (Ctrl+F5 / Cmd+Shift+R).

echo -e "${YELLOW}Note: No cache invalidation needed - all routes use TTL=0 (no caching)${NC}"
echo -e "${YELLOW}Static assets use hashed filenames, so new builds automatically use new URLs${NC}"

