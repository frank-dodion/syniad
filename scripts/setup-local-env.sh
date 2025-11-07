#!/bin/bash
# Script to generate .env.local files for Next.js apps from Terraform outputs

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Setting up local environment variables ===${NC}\n"

# Check if Terraform is initialized
if [ ! -d "terraform" ]; then
    echo "Error: terraform directory not found"
    exit 1
fi

cd terraform

# Get Terraform outputs
echo "Fetching Cognito configuration from Terraform..."
USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")
DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")

cd ..

if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
    echo "Error: Could not get Cognito configuration from Terraform outputs"
    echo "Make sure Terraform is initialized and the infrastructure is deployed"
    exit 1
fi

# Better Auth expects the full domain format: domain.auth.region.amazoncognito.com
# The domain from Terraform is just the name (e.g., "syniad-dev-auth-dev")
# We need to construct the full domain
if [ -n "$DOMAIN" ]; then
    COGNITO_DOMAIN="${DOMAIN}.auth.${REGION}.amazoncognito.com"
else
    echo "Warning: Cognito domain not found, you may need to set COGNITO_DOMAIN manually"
    COGNITO_DOMAIN=""
fi

# Create .env.local for scenario-editor
echo -e "${GREEN}Creating .env.local for scenario-editor...${NC}"
cat > frontend/scenario-editor/.env.local << EOF
# Cognito Configuration (for Better Auth)
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
COGNITO_CLIENT_SECRET=
COGNITO_REGION=${REGION}
COGNITO_DOMAIN=${COGNITO_DOMAIN}

# Next.js Configuration
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=https://dev.api.syniad.net
EOF

# Create .env.local for game
echo -e "${GREEN}Creating .env.local for game...${NC}"
cat > frontend/game/.env.local << EOF
# Cognito Configuration (for Better Auth)
COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
COGNITO_CLIENT_SECRET=
COGNITO_REGION=${REGION}
COGNITO_DOMAIN=${COGNITO_DOMAIN}

# Next.js Configuration
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=https://dev.api.syniad.net
EOF

echo -e "\n${GREEN}✓ Environment files created successfully!${NC}"
echo "  - frontend/scenario-editor/.env.local"
echo "  - frontend/game/.env.local"
echo ""
echo "You can now run 'npm run dev' in either app directory"

