#!/bin/bash

# Complete deployment script - builds Lambdas, applies Terraform, and deploys both frontends
# Usage: ./scripts/deploy-all.sh [stage]
# Default stage: dev

set -e

# Clear terminal at start only if stdout is a TTY
if [ -t 1 ]; then
  clear
fi

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
echo ""

# Step 2: Apply Terraform
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 2: Applying Terraform infrastructure...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT/terraform"

# Select or create workspace
if [ "$STAGE" = "dev" ]; then
    echo -e "${YELLOW}Switched to workspace \"dev\".${NC}"
    terraform workspace select dev 2>/dev/null || terraform workspace new dev
elif [ "$STAGE" = "prod" ]; then
    echo -e "${YELLOW}Switched to workspace \"prod\".${NC}"
    terraform workspace select prod 2>/dev/null || terraform workspace new prod
fi

terraform apply -var="stage=${STAGE}" -auto-approve
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Terraform apply failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Infrastructure updated${NC}"
echo ""

# Step 3: Deploy static assets (always deploy fresh build output)
# Terraform's null_resource.deploy_static_assets only triggers on config changes,
# not on build output changes, so we need to manually deploy after building
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 3: Deploying static assets to S3...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/deploy-static-assets.sh "$STAGE"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Static assets deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Static assets deployed${NC}"
echo ""

# Step 4: Invalidate CloudFront cache for static assets (ensures new chunks load)
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 4: Invalidating CloudFront static asset cache...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/invalidate-cloudfront-cache.sh "$STAGE"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ CloudFront invalidation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ CloudFront invalidation requested${NC}"
echo ""

# Step 5: Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Deployment Complete!            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT/terraform"
# Ensure we're in the correct workspace before reading outputs
if [ "$STAGE" = "dev" ]; then
    echo -e "${YELLOW}Switched to workspace \"dev\".${NC}"
    terraform workspace select dev 2>/dev/null || true
elif [ "$STAGE" = "prod" ]; then
    echo -e "${YELLOW}Switched to workspace \"prod\".${NC}"
    terraform workspace select prod 2>/dev/null || true
fi
GAME_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")
API_URL=$(terraform output -raw api_url 2>/dev/null || echo "")
DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")

echo -e "${GREEN}Deployed Applications (${STAGE}):${NC}"
if [ -n "$GAME_URL" ]; then
    echo -e "  ${GREEN}✓${NC} Game App:        ${GAME_URL}"
    echo -e "  ${GREEN}✓${NC} Scenario Editor: ${GAME_URL}/editor"
fi
if [ -n "$API_URL" ]; then
    echo -e "  ${GREEN}✓${NC} API:             ${API_URL}"
    echo -e "  ${GREEN}✓${NC} API Docs:        ${API_URL}/docs"
fi
if [ -n "$DIST_ID" ]; then
    echo -e "  ${GREEN}✓${NC} CloudFront ID:   ${DIST_ID}"
fi
echo ""

