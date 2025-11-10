#!/bin/bash

# Destroy and recreate CloudFront distribution
# Usage: ./scripts/recreate-cloudfront.sh [stage]
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
echo -e "${BLUE}║   Recreate CloudFront Distribution     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Stage: ${STAGE}${NC}"
echo ""

cd "$PROJECT_ROOT/terraform"

# Select workspace
if [ "$STAGE" = "dev" ]; then
    terraform workspace select dev 2>/dev/null || terraform workspace new dev
elif [ "$STAGE" = "prod" ]; then
    terraform workspace select prod 2>/dev/null || terraform workspace new prod
fi

# Get current distribution ID
CURRENT_DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")
if [ -n "$CURRENT_DIST_ID" ]; then
    echo -e "${YELLOW}Current CloudFront Distribution ID: ${CURRENT_DIST_ID}${NC}"
    echo ""
fi

# Step 1: Disable CloudFront distribution (required before destroy)
if [ -n "$CURRENT_DIST_ID" ]; then
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Step 1: Disabling CloudFront distribution...${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Get current config
    ETAG=$(aws cloudfront get-distribution-config --id "$CURRENT_DIST_ID" --query 'ETag' --output text 2>/dev/null || echo "")
    if [ -n "$ETAG" ]; then
        # Disable distribution
        aws cloudfront get-distribution-config --id "$CURRENT_DIST_ID" --output json > /tmp/cf-config.json
        python3 -c "
import json
with open('/tmp/cf-config.json', 'r') as f:
    data = json.load(f)
    config = data['DistributionConfig']
    config['Enabled'] = False
    print(json.dumps(config))
" > /tmp/cf-config-disabled.json
        
        aws cloudfront update-distribution --id "$CURRENT_DIST_ID" --if-match "$ETAG" --distribution-config file:///tmp/cf-config-disabled.json > /dev/null 2>&1 || true
        echo -e "${GREEN}✓ Distribution disabled${NC}"
        echo -e "${YELLOW}Waiting for distribution to be disabled (this may take a few minutes)...${NC}"
        
        # Wait for distribution to be disabled
        while true; do
            STATUS=$(aws cloudfront get-distribution --id "$CURRENT_DIST_ID" --query 'Distribution.Status' --output text 2>/dev/null || echo "Deployed")
            if [ "$STATUS" = "Deployed" ]; then
                break
            fi
            echo -e "${YELLOW}  Status: ${STATUS}... waiting${NC}"
            sleep 10
        done
        echo -e "${GREEN}✓ Distribution is disabled${NC}"
    fi
    echo ""
fi

# Step 2: Destroy CloudFront distribution
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 2: Destroying CloudFront distribution...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
terraform destroy -target=aws_cloudfront_distribution.frontend -target=aws_route53_record.frontend -target=aws_route53_record.frontend_ipv6 -auto-approve
echo -e "${GREEN}✓ CloudFront distribution destroyed${NC}"
echo ""

# Step 3: Recreate CloudFront distribution
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 3: Recreating CloudFront distribution...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
terraform apply -var="stage=${STAGE}" -auto-approve
echo -e "${GREEN}✓ CloudFront distribution recreated${NC}"
echo ""

# Step 4: Deploy static assets
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 4: Deploying static assets...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
bash scripts/deploy-static-assets.sh "$STAGE"
echo -e "${GREEN}✓ Static assets deployed${NC}"
echo ""

# Step 5: Invalidate cache
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 5: Invalidating CloudFront cache...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
bash scripts/invalidate-cloudfront-cache.sh "$STAGE" || echo -e "${YELLOW}⚠ Cache invalidation failed (continuing...)${NC}"
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Recreate Complete!            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT/terraform"
NEW_DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")

echo -e "${GREEN}New CloudFront Distribution:${NC}"
if [ -n "$NEW_DIST_ID" ]; then
    echo -e "  ${GREEN}✓${NC} Distribution ID: ${NEW_DIST_ID}"
fi
if [ -n "$FRONTEND_URL" ]; then
    echo -e "  ${GREEN}✓${NC} Frontend URL:     ${FRONTEND_URL}"
fi
echo ""
echo -e "${YELLOW}Note: CloudFront distribution is being deployed.${NC}"
echo -e "${YELLOW}This typically takes 15-20 minutes to propagate globally.${NC}"
echo ""

