#!/bin/bash

# Deploy frontend to S3 and invalidate CloudFront cache
# Usage: ./scripts/deploy-frontend.sh [stage]
# Default stage: dev

set -e

STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend/scenario-editor"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Deploying frontend to ${STAGE}...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
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
    echo -e "${RED}Error: Could not get CloudFront distribution ID from Terraform${NC}"
    echo "Make sure Terraform has been applied: cd terraform && terraform apply"
    exit 1
fi

echo -e "${GREEN}✓ Found S3 bucket: ${BUCKET_NAME}${NC}"
echo -e "${GREEN}✓ Found CloudFront distribution: ${DISTRIBUTION_ID}${NC}"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found: $FRONTEND_DIR${NC}"
    exit 1
fi

# Get API URL and Cognito config from Terraform
API_URL=$(terraform output -raw custom_domain_url 2>/dev/null || terraform output -raw api_url 2>/dev/null || echo "https://dev.api.syniad.net")
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
COGNITO_REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")

echo -e "${YELLOW}API URL: ${API_URL}${NC}"

# Create a temporary directory for deployment
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy frontend files to temp directory
echo -e "${YELLOW}Preparing files...${NC}"
cp -r "$FRONTEND_DIR"/* "$TEMP_DIR/"

# Create config.js with API and Cognito configuration
cat > "$TEMP_DIR/config.js" <<EOF
// Auto-generated configuration
window.API_BASE_URL = "${API_URL}";
window.AUTH_CONFIG = {
    userPoolId: "${COGNITO_USER_POOL_ID}",
    clientId: "${COGNITO_CLIENT_ID}",
    region: "${COGNITO_REGION}",
    domain: "${COGNITO_DOMAIN}",
    redirectUri: window.location.origin + window.location.pathname
};
EOF

# Update index.html to include config.js
if ! grep -q "config.js" "$TEMP_DIR/index.html"; then
    # Insert config.js before other scripts
    sed -i.bak '/<script src="auth.js">/i\
    <script src="config.js"></script>
' "$TEMP_DIR/index.html"
    rm "$TEMP_DIR/index.html.bak" 2>/dev/null || true
fi

# Upload to S3
echo -e "${YELLOW}Uploading files to S3...${NC}"
aws s3 sync "$TEMP_DIR" "s3://${BUCKET_NAME}/scenario-editor/" \
    --delete \
    --exclude "*.bak" \
    --cache-control "public, max-age=3600" \
    --exclude "*.html" \
    --exclude "*.js" \
    --exclude "*.css"

# Upload HTML, JS, and CSS with shorter cache
aws s3 sync "$TEMP_DIR" "s3://${BUCKET_NAME}/scenario-editor/" \
    --delete \
    --exclude "*" \
    --include "*.html" \
    --include "*.js" \
    --include "*.css" \
    --cache-control "public, max-age=0, must-revalidate"

echo -e "${GREEN}✓ Files uploaded to S3${NC}"

# Invalidate CloudFront cache
if [ -n "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/scenario-editor/*" \
        --query 'Invalidation.Id' \
        --output text)
    
    echo -e "${GREEN}✓ CloudFront invalidation created: ${INVALIDATION_ID}${NC}"
    echo -e "${YELLOW}Note: Cache invalidation may take a few minutes to complete${NC}"
fi

# Get frontend URL
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")
if [ -n "$FRONTEND_URL" ]; then
    echo ""
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
    echo -e "${GREEN}Frontend URL: ${FRONTEND_URL}/scenario-editor/${NC}"
    echo ""
else
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
fi

