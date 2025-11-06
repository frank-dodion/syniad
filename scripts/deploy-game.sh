#!/bin/bash

# Deploy main game frontend to S3 and invalidate CloudFront cache
# Usage: ./scripts/deploy-game.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend/game"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found: $FRONTEND_DIR${NC}"
    exit 1
fi

# Get Terraform outputs
cd "$PROJECT_ROOT/terraform"

echo -e "${YELLOW}Getting Terraform outputs...${NC}"
BUCKET_NAME=$(terraform output -raw frontend_bucket_name 2>/dev/null || echo "")
DISTRIBUTION_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")

if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: Could not get S3 bucket name from Terraform${NC}"
    echo "Make sure Terraform has been applied: cd terraform && terraform apply"
    exit 1
fi

if [ -z "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Warning: Could not get CloudFront distribution ID${NC}"
    echo "Cache invalidation will be skipped"
fi

echo -e "${GREEN}Deploying to bucket: ${BUCKET_NAME}${NC}"

# Sync files to S3 (delete removed files, exclude hidden files)
echo -e "${YELLOW}Uploading files to S3...${NC}"
aws s3 sync "$FRONTEND_DIR" "s3://${BUCKET_NAME}/" \
    --delete \
    --exclude ".*" \
    --exclude "*.map" \
    --cache-control "public, max-age=3600" \
    --exclude "*.html" \
    --exclude "*.js" \
    --exclude "*.css"

# Upload HTML files with no-cache
aws s3 sync "$FRONTEND_DIR" "s3://${BUCKET_NAME}/" \
    --exclude "*" \
    --include "*.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html; charset=utf-8"

# Upload JS and CSS files with cache
aws s3 sync "$FRONTEND_DIR" "s3://${BUCKET_NAME}/" \
    --exclude "*" \
    --include "*.js" \
    --include "*.css" \
    --cache-control "public, max-age=31536000, immutable"

echo -e "${GREEN}✓ Files uploaded successfully${NC}"

# Invalidate CloudFront cache
if [ -n "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$INVALIDATION_ID" ]; then
        echo -e "${GREEN}✓ CloudFront invalidation created: ${INVALIDATION_ID}${NC}"
        echo -e "${YELLOW}  Status: In progress (usually completes in 1-2 minutes)${NC}"
    else
        echo -e "${YELLOW}⚠ Could not create CloudFront invalidation (may already be in progress)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping CloudFront invalidation (distribution ID not found)${NC}"
fi

# Get game URL
GAME_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")
if [ -n "$GAME_URL" ]; then
    echo ""
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
    echo -e "${GREEN}Game URL: ${GAME_URL}/${NC}"
    echo ""
else
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
fi
