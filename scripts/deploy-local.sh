#!/bin/bash

# Deploy and run the app locally using Docker, connected to dev backend services
# Usage: ./scripts/deploy-local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Clear terminal at start only if stdout is a TTY
if [ -t 1 ]; then
  clear
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Local Docker Deployment (Dev Backend) ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 0: Stop any existing containers for a clean start
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 0: Stopping any existing containers...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
cd "$PROJECT_ROOT"
docker compose down --remove-orphans 2>/dev/null || true
echo -e "${GREEN}✓ Cleaned up existing containers${NC}"
echo ""

# Step 1: Get dev environment configuration from Terraform
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 1: Getting dev environment configuration...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$PROJECT_ROOT/terraform"
terraform workspace select dev 2>/dev/null || terraform workspace new dev

# Get all dev environment variables from Terraform
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
COGNITO_REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")
GAMES_TABLE=$(terraform output -raw games_table_name 2>/dev/null || echo "")
PLAYER_GAMES_TABLE=$(terraform output -raw player_games_table_name 2>/dev/null || echo "")
SCENARIOS_TABLE=$(terraform output -raw scenarios_table_name 2>/dev/null || echo "")
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "https://dev.syniad.net")
WEBSOCKET_ENDPOINT_RAW=$(terraform output -raw websocket_api_endpoint 2>/dev/null || echo "")
WEBSOCKET_URL=""
WEBSOCKET_ENDPOINT_HTTPS=""
CONNECTIONS_TABLE=""
if [ -n "$WEBSOCKET_ENDPOINT_RAW" ]; then
  # Remove wss:// prefix if present (Terraform output already includes it)
  WEBSOCKET_ENDPOINT_CLEAN="${WEBSOCKET_ENDPOINT_RAW#wss://}"
  # Construct full WebSocket URL with stage
  WEBSOCKET_URL="wss://${WEBSOCKET_ENDPOINT_CLEAN}/dev"
  # Construct HTTPS endpoint for API Gateway Management API (for broadcasting)
  WEBSOCKET_ENDPOINT_HTTPS="https://${WEBSOCKET_ENDPOINT_CLEAN}/dev"
fi
# Construct connections table name (follows pattern: syniad-{stage}-websocket-connections)
# Stage is always "dev" for local deployment
CONNECTIONS_TABLE="syniad-dev-websocket-connections"

if [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_CLIENT_ID" ] || [ -z "$COGNITO_DOMAIN" ]; then
  echo -e "${RED}✗ Error: Could not get Cognito configuration from Terraform${NC}"
  echo -e "${YELLOW}  Make sure Terraform has been applied for dev environment${NC}"
  echo -e "${YELLOW}  Run: cd terraform && terraform workspace select dev && terraform apply${NC}"
  exit 1
fi

# Construct full Cognito domain
FULL_COGNITO_DOMAIN="${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com"

echo -e "${GREEN}✓ Got dev environment configuration${NC}"
echo "  Cognito User Pool: $COGNITO_USER_POOL_ID"
echo "  Cognito Client: $COGNITO_CLIENT_ID"
echo "  Cognito Domain: $FULL_COGNITO_DOMAIN"
echo "  DynamoDB Tables: $GAMES_TABLE, $PLAYER_GAMES_TABLE, $SCENARIOS_TABLE"
if [ -n "$WEBSOCKET_URL" ]; then
  echo "  WebSocket URL: $WEBSOCKET_URL"
  echo "  WebSocket Endpoint: $WEBSOCKET_ENDPOINT_HTTPS"
  echo "  Connections Table: $CONNECTIONS_TABLE"
else
  echo "  WebSocket URL: (not configured)"
fi
echo ""

# Verify AWS credentials are available
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if [ -f "$HOME/.aws/credentials" ] || [ -f "$HOME/.aws/config" ]; then
  echo -e "${GREEN}✓ AWS credentials file found${NC}"
else
  if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${RED}✗ Warning: AWS credentials not found${NC}"
    echo -e "${YELLOW}  The container needs AWS credentials to access DynamoDB.${NC}"
    echo -e "${YELLOW}  Options:${NC}"
    echo -e "${YELLOW}    1. Configure AWS credentials: ${BLUE}aws configure${NC}"
    echo -e "${YELLOW}    2. Set environment variables: ${BLUE}AWS_ACCESS_KEY_ID${NC} and ${BLUE}AWS_SECRET_ACCESS_KEY${NC}"
    echo -e "${YELLOW}  The container will fail if credentials are not available.${NC}"
    echo ""
  else
    echo -e "${GREEN}✓ AWS credentials found in environment variables${NC}"
  fi
fi
echo ""

# Step 2: Create/update .env file with dev backend configuration
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 2: Setting up .env file for local Docker...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$PROJECT_ROOT"

# Create .env file with dev backend configuration
cat > .env <<EOF
# Local Docker deployment - connected to dev backend
# Generated by deploy-local.sh - do not commit to git

# Application URLs (local)
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# Server Configuration
NODE_ENV=production
PORT=8080
HOSTNAME=0.0.0.0
NEXT_TELEMETRY_DISABLED=1

# Static Assets (empty for local - uses container files)
NEXT_PUBLIC_ASSET_PREFIX=
NEXT_PUBLIC_BASE_PATH=

# Cognito Configuration (from dev environment)
COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
COGNITO_CLIENT_SECRET=
COGNITO_REGION=$COGNITO_REGION
COGNITO_DOMAIN=$FULL_COGNITO_DOMAIN

# Better Auth Secret (local dev - not used in production)
BETTER_AUTH_SECRET=local-dev-secret-change-in-production-min-32-chars

# AWS Configuration for DynamoDB access
# The container will use AWS credentials from:
# 1. Environment variables (if set below)
# 2. AWS credentials file mounted from host (~/.aws/credentials)
# 3. IAM role (if running on EC2)
AWS_REGION=$AWS_REGION
# Option 1: Set credentials explicitly (not recommended - use AWS_PROFILE instead)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_SESSION_TOKEN=
# Option 2: Use AWS profile from host (recommended)
# Set this to your AWS profile name if you use named profiles
# Leave empty to use default profile
AWS_PROFILE=

# DynamoDB Table Names (from dev environment)
GAMES_TABLE=$GAMES_TABLE
PLAYER_GAMES_TABLE=$PLAYER_GAMES_TABLE
SCENARIOS_TABLE=$SCENARIOS_TABLE

# WebSocket Configuration (from dev environment)
WEBSOCKET_URL=$WEBSOCKET_URL
# WebSocket broadcast configuration (for API routes to broadcast messages)
CONNECTIONS_TABLE=$CONNECTIONS_TABLE
WEBSOCKET_ENDPOINT=$WEBSOCKET_ENDPOINT_HTTPS
EOF

echo -e "${GREEN}✓ Created .env file with dev backend configuration${NC}"
echo ""

# Step 3: Build Docker image (environment-agnostic)
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 3: Building Docker image...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Ensure buildx is available - install if needed (for Colima)
if ! docker buildx version >/dev/null 2>&1; then
  echo -e "${YELLOW}buildx not found, installing...${NC}"
  
  # Determine system architecture
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    ARCH="amd64"
  elif [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
  fi
  
  # Use latest stable version
  BUILDX_VERSION="v0.12.1"
  
  # Create CLI plugins directory
  mkdir -p ~/.docker/cli-plugins
  
  # Download buildx binary
  echo -e "${YELLOW}Downloading buildx ${BUILDX_VERSION} for ${ARCH}...${NC}"
  curl -L -o ~/.docker/cli-plugins/docker-buildx \
    "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.darwin-${ARCH}" 2>/dev/null
  
  if [ $? -eq 0 ] && [ -f ~/.docker/cli-plugins/docker-buildx ]; then
    chmod +x ~/.docker/cli-plugins/docker-buildx
    echo -e "${GREEN}✓ buildx installed successfully${NC}"
  else
    echo -e "${RED}✗ Failed to install buildx, falling back to legacy docker build${NC}"
    echo -e "${YELLOW}(Note: This will show a deprecation warning, but will still work)${NC}"
    docker build \
      --platform linux/amd64 \
      -f Dockerfile \
      -t syniad-app-local:latest \
      .
    if [ $? -ne 0 ]; then
      echo -e "${RED}✗ Docker build failed${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
    echo ""
    exit 0
  fi
fi

# Create buildx builder instance if needed
if ! docker buildx ls | grep -q "default"; then
  echo -e "${YELLOW}Creating buildx builder instance...${NC}"
  docker buildx create --name default --use 2>/dev/null || docker buildx use default 2>/dev/null || true
fi

# Permanently remove credsStore from Docker config if it's set to "desktop" (Colima doesn't need it)
if [ -f ~/.docker/config.json ] && grep -q '"credsStore": "desktop"' ~/.docker/config.json 2>/dev/null; then
  echo -e "${YELLOW}Removing Docker Desktop credential helper from config (permanent fix for Colima)...${NC}"
  python3 -c "
import json
import sys
try:
    with open('$HOME/.docker/config.json', 'r') as f:
        config = json.load(f)
    if 'credsStore' in config and config['credsStore'] == 'desktop':
        del config['credsStore']
        with open('$HOME/.docker/config.json', 'w') as f:
            json.dump(config, f, indent='\t')
        print('Removed credsStore from Docker config')
        sys.exit(0)
    else:
        sys.exit(1)
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null && echo -e "${GREEN}✓ Removed Docker Desktop credential helper (not needed for Colima)${NC}" || \
  echo -e "${YELLOW}Note: Could not modify Docker config automatically. You may need to manually remove 'credsStore' from ~/.docker/config.json${NC}"
fi

# Build the environment-agnostic Docker image using buildx
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile \
  -t syniad-app-local:latest \
  --load \
  .

BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
  echo -e "${RED}✗ Docker build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Step 4: Start the container
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 4: Starting Docker container...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Start the container with fresh configuration
# Use --force-recreate to ensure volume mounts are applied
docker compose up -d --force-recreate

if [ $? -ne 0 ]; then
  echo -e "${RED}✗ Failed to start Docker container${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker container started${NC}"
echo ""

# Step 5: Show status and URLs
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Local Deployment Complete!       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Local Application URLs:${NC}"
echo -e "  ${GREEN}✓${NC} Landing Page:    http://localhost:3000"
echo -e "  ${GREEN}✓${NC} Game:            http://localhost:3000/game"
echo -e "  ${GREEN}✓${NC} Scenario Editor: http://localhost:3000/scenario"
echo -e "  ${GREEN}✓${NC} API:             http://localhost:3000/api"
echo -e "  ${GREEN}✓${NC} API Docs:        http://localhost:3000/api/docs"
if [ -n "$WEBSOCKET_URL" ]; then
  echo -e "  ${GREEN}✓${NC} WebSocket:       $WEBSOCKET_URL"
else
  echo -e "  ${YELLOW}⚠${NC} WebSocket:       (not configured - run terraform apply first)"
fi
echo ""
echo -e "${GREEN}Backend Services (Dev):${NC}"
echo -e "  ${GREEN}✓${NC} Cognito:         $FULL_COGNITO_DOMAIN"
echo -e "  ${GREEN}✓${NC} DynamoDB:        $GAMES_TABLE, $PLAYER_GAMES_TABLE, $SCENARIOS_TABLE"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure AWS credentials are configured to access DynamoDB:"
echo -e "  - AWS credentials file: ${BLUE}~/.aws/credentials${NC}"
echo -e "  - Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
  echo -e "  View logs:     ${BLUE}docker compose logs -f${NC}"
  echo -e "  Stop:          ${BLUE}docker compose down${NC}"
  echo -e "  Restart:       ${BLUE}docker compose restart${NC}"
echo -e "  Rebuild:       ${BLUE}npm run deploy:local${NC}"
echo ""

