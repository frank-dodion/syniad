#!/bin/bash

# Complete deployment script - builds Lambdas, applies Terraform, and deploys both frontends
# Usage: ./scripts/deploy-all.sh [stage]
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

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Syniad Full Deployment Pipeline    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Stage: ${STAGE}${NC}"
echo ""

# Step 1: Build Next.js apps (for static assets deployment to S3)
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 1: Building Next.js applications...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/build-nextjs.sh
# Note: package-nextjs-lambda.sh is no longer needed - we use Docker container images
echo ""

# Step 2: Build Lambda functions (skipped - API routes are now in Next.js app)
# echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# echo -e "${YELLOW}Step 2: Building Lambda functions...${NC}"
# echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# cd "$PROJECT_ROOT"
# npm run build:lambda
# if [ $? -ne 0 ]; then
#     echo -e "${RED}✗ Lambda build failed${NC}"
#     exit 1
# fi
# echo -e "${GREEN}✓ Lambda functions built${NC}"
# echo ""

# Step 3: Cleanup orphaned resources (if any)
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 3: Cleaning up orphaned resources...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/cleanup-orphaned-resources.sh "$STAGE" || echo -e "${YELLOW}⚠ Cleanup script failed or no resources to clean (continuing...)${NC}"
echo ""

# Step 4: Apply Terraform
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 4: Applying Terraform infrastructure...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT/terraform"

# Select or create workspace
if [ "$STAGE" = "dev" ]; then
    terraform workspace select dev 2>/dev/null || terraform workspace new dev
elif [ "$STAGE" = "prod" ]; then
    terraform workspace select prod 2>/dev/null || terraform workspace new prod
fi

terraform apply -var="stage=${STAGE}" -auto-approve
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Terraform apply failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Infrastructure updated${NC}"
echo ""

# Step 5: Deploy static assets
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 5: Deploying static assets to S3...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/deploy-static-assets.sh "$STAGE"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Static assets deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Static assets deployed${NC}"
echo ""

# Step 6: Invalidate CloudFront cache
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 6: Invalidating CloudFront cache...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/invalidate-cloudfront-cache.sh "$STAGE" || echo -e "${YELLOW}⚠ Cache invalidation failed (continuing...)${NC}"
echo ""

# Step 7: Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Deployment Complete!            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT/terraform"
GAME_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")
API_URL=$(terraform output -raw api_url 2>/dev/null || echo "")

echo -e "${GREEN}Deployed Applications:${NC}"
if [ -n "$GAME_URL" ]; then
    echo -e "  ${GREEN}✓${NC} Game App:        ${GAME_URL}"
    echo -e "  ${GREEN}✓${NC} Scenario Editor: ${GAME_URL}/editor"
fi
if [ -n "$API_URL" ]; then
    echo -e "  ${GREEN}✓${NC} API:             ${API_URL}"
    echo -e "  ${GREEN}✓${NC} API Docs:        ${API_URL}/docs"
fi
echo ""
echo -e "${YELLOW}Note: CloudFront cache invalidations are in progress.${NC}"
echo -e "${YELLOW}Changes may take 1-2 minutes to be visible.${NC}"
echo ""

