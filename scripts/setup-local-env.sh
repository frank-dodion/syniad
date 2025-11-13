#!/bin/bash

# Setup script for local Docker development
# Creates separate .env files for each Docker app and REST API testing
# Ensures no unwanted values leak between files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Setting up local development environment..."
echo ""

# Define all env file paths
ROOT_ENV="$PROJECT_ROOT/.env"
API_TEST_ENV="$PROJECT_ROOT/.env.api-test"
OLD_ENV="$PROJECT_ROOT/.env.backup"

# Step 1: Backup existing .env file if it exists and contains REST Client tokens
if [ -f "$ROOT_ENV" ]; then
  echo "⚠️  Found existing .env file"
  
  # Check if it contains REST Client tokens
  if grep -q "^ID_TOKEN=" "$ROOT_ENV" || grep -q "^REFRESH_TOKEN=" "$ROOT_ENV"; then
    echo "   Detected REST Client tokens - migrating to .env.api-test..."
    if [ ! -f "$API_TEST_ENV" ]; then
      {
        echo "# Cognito Test Credentials for REST Client"
        echo "# Migrated from .env on $(date)"
        echo "# This file is gitignored - safe for storing tokens"
        echo ""
        grep -E "^(API_URL|ID_TOKEN|REFRESH_TOKEN|GAME_ID)=" "$ROOT_ENV" 2>/dev/null || true
      } > "$API_TEST_ENV"
      echo "   ✓ Migrated REST Client tokens to .env.api-test"
    fi
  fi
  
  # Backup old .env file
  cp "$ROOT_ENV" "$OLD_ENV"
  echo "   ✓ Backed up old .env to .env.backup"
fi

# Step 2: Get values from Terraform
echo ""
echo "Attempting to get values from Terraform..."
cd "$PROJECT_ROOT/terraform"

COGNITO_POOL_ID=""
COGNITO_CLIENT_ID=""
COGNITO_DOMAIN=""
COGNITO_REGION="us-east-1"
AWS_REGION="us-east-1"
GAMES_TABLE=""
PLAYER_GAMES_TABLE=""
SCENARIOS_TABLE=""

# Try to get values from Terraform outputs
# Check if terraform is initialized and has outputs
if [ -f ".terraform/terraform.tfstate" ] || terraform output cognito_user_pool_id > /dev/null 2>&1; then
  COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
  COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
  COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
  COGNITO_REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")
  AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")
  GAMES_TABLE=$(terraform output -raw games_table_name 2>/dev/null || echo "")
  PLAYER_GAMES_TABLE=$(terraform output -raw player_games_table_name 2>/dev/null || echo "")
  SCENARIOS_TABLE=$(terraform output -raw scenarios_table_name 2>/dev/null || echo "")
  
  if [ -n "$COGNITO_POOL_ID" ] && [ -n "$COGNITO_CLIENT_ID" ]; then
    echo "✓ Found Cognito values from Terraform:"
    echo "  User Pool ID: $COGNITO_POOL_ID"
    echo "  Client ID: $COGNITO_CLIENT_ID"
    echo "  Domain: $COGNITO_DOMAIN"
    echo "  Region: $COGNITO_REGION"
  else
    echo "⚠️  Could not get all Cognito values from Terraform"
    echo "   Make sure Terraform has been applied: cd terraform && terraform apply"
  fi
  
  # If we have GAMES_TABLE but missing others, try to derive them from the pattern
  # Table names follow pattern: ${service_name}-games, ${service_name}-player-games, ${service_name}-scenarios
  if [ -n "$GAMES_TABLE" ] && [ -z "$PLAYER_GAMES_TABLE" ]; then
    # Extract service name from games table (e.g., "syniad-dev-games" -> "syniad-dev")
    SERVICE_NAME=$(echo "$GAMES_TABLE" | sed 's/-games$//')
    if [ -n "$SERVICE_NAME" ]; then
      PLAYER_GAMES_TABLE="${SERVICE_NAME}-player-games"
      echo "  ℹ️  Derived Player Games Table from pattern: $PLAYER_GAMES_TABLE"
    fi
  fi
  
  if [ -n "$GAMES_TABLE" ] && [ -z "$SCENARIOS_TABLE" ]; then
    # Extract service name from games table (e.g., "syniad-dev-games" -> "syniad-dev")
    SERVICE_NAME=$(echo "$GAMES_TABLE" | sed 's/-games$//')
    if [ -n "$SERVICE_NAME" ]; then
      SCENARIOS_TABLE="${SERVICE_NAME}-scenarios"
      echo "  ℹ️  Derived Scenarios Table from pattern: $SCENARIOS_TABLE"
    fi
  fi
  
  # Report what we found (even if some are missing)
  echo ""
  echo "DynamoDB table names:"
  if [ -n "$GAMES_TABLE" ]; then
    echo "  ✓ Games Table: $GAMES_TABLE"
  else
    echo "  ⚠️  Games Table: not found"
  fi
  if [ -n "$PLAYER_GAMES_TABLE" ]; then
    echo "  ✓ Player Games Table: $PLAYER_GAMES_TABLE"
  else
    echo "  ⚠️  Player Games Table: not found"
  fi
  if [ -n "$SCENARIOS_TABLE" ]; then
    echo "  ✓ Scenarios Table: $SCENARIOS_TABLE"
  else
    echo "  ⚠️  Scenarios Table: not found"
  fi
  
  if [ -z "$GAMES_TABLE" ] || [ -z "$PLAYER_GAMES_TABLE" ] || [ -z "$SCENARIOS_TABLE" ]; then
    echo ""
    echo "⚠️  Some DynamoDB table names are missing"
    echo "   This might be because:"
    echo "   1. Terraform hasn't been applied yet: cd terraform && terraform apply"
    echo "   2. The outputs don't exist in your Terraform state"
    echo "   You can manually set these values in .env if needed"
  fi
else
  echo "⚠️  Terraform not initialized or outputs not available"
  echo "   Initialize Terraform: cd terraform && terraform init"
  echo "   Apply Terraform: cd terraform && terraform apply"
fi

# Construct full Cognito domain
if [ -n "$COGNITO_DOMAIN" ]; then
  FULL_DOMAIN="$COGNITO_DOMAIN.auth.$COGNITO_REGION.amazoncognito.com"
else
  FULL_DOMAIN=""
fi

cd "$PROJECT_ROOT"

# Step 3: Create single root .env file with all variables
echo ""
echo "Creating root .env file with all environment variables..."
cat > "$ROOT_ENV" << EOF
# Docker Compose Environment Variables
# This .env file contains all variables for the app
# Docker Compose automatically reads this file for variable substitution
# Do not commit secrets to git

# ============================================================================
# Build-time variables (for Docker build args)
# NEXT_PUBLIC_* vars are embedded at build time during npm run build
# ============================================================================
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000

# ============================================================================
# Runtime variables
# ============================================================================
NODE_ENV=production
PORT=8080
HOSTNAME=0.0.0.0
NEXT_TELEMETRY_DISABLED=1

# Static Assets - leave empty for local (uses local files)
NEXT_PUBLIC_ASSET_PREFIX=
NEXT_PUBLIC_BASE_PATH=

# Cognito Configuration
COGNITO_USER_POOL_ID=${COGNITO_POOL_ID}
COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
COGNITO_CLIENT_SECRET=
COGNITO_REGION=${COGNITO_REGION}
COGNITO_DOMAIN=${FULL_DOMAIN}

# Better Auth Secret (for local dev)
BETTER_AUTH_SECRET=local-dev-secret-change-in-production

# Auth URLs
NEXTAUTH_URL=http://localhost:3000

# ============================================================================
# AWS Configuration for DynamoDB (optional - for local dev with real DynamoDB)
# ============================================================================
# Set these if you want to connect to real DynamoDB tables when running locally
# AWS SDK will automatically use credentials from:
# - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
# - AWS credentials file (~/.aws/credentials) via AWS_PROFILE
# - IAM role (when running on EC2/Lambda)
# Leave empty to use default AWS credential chain
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
AWS_PROFILE=

# DynamoDB Table Names (from Terraform)
# These are required for connecting to real DynamoDB tables
# If empty, you can manually set them based on your Terraform outputs:
#   terraform output games_table_name
#   terraform output player_games_table_name
#   terraform output scenarios_table_name
GAMES_TABLE=${GAMES_TABLE}
PLAYER_GAMES_TABLE=${PLAYER_GAMES_TABLE}
SCENARIOS_TABLE=${SCENARIOS_TABLE}

# Set LOCAL_MODE=true to use in-memory mock storage instead of real DynamoDB
# Set LOCAL_MODE=false (or leave empty) to use real DynamoDB when credentials are available
LOCAL_MODE=false

# ============================================================================
# API Testing / REST Client Variables (optional)
# ============================================================================
# These are used by REST Client .http files and API test scripts
# Run ./scripts/test-cognito-auth.sh to populate ID_TOKEN and REFRESH_TOKEN
API_URL=https://dev.syniad.net/api
ID_TOKEN=
REFRESH_TOKEN=
GAME_ID=paste-game-id-here
EOF
echo "✓ Created root .env file"

echo ""
echo "----- .env -----"
cat "$ROOT_ENV"
echo "----------------"

# Step 6: Migrate tokens from .env.api-test if it exists
if [ -f "$API_TEST_ENV" ]; then
  echo ""
  echo "Migrating tokens from .env.api-test to .env..."
  
  # Extract tokens from .env.api-test
  OLD_ID_TOKEN=$(grep "^ID_TOKEN=" "$API_TEST_ENV" 2>/dev/null | cut -d'=' -f2- | head -1)
  OLD_REFRESH_TOKEN=$(grep "^REFRESH_TOKEN=" "$API_TEST_ENV" 2>/dev/null | cut -d'=' -f2- | head -1)
  OLD_GAME_ID=$(grep "^GAME_ID=" "$API_TEST_ENV" 2>/dev/null | cut -d'=' -f2- | head -1)
  OLD_API_URL=$(grep "^API_URL=" "$API_TEST_ENV" 2>/dev/null | cut -d'=' -f2- | head -1)
  
  # Update .env with tokens if they exist
  if [ -n "$OLD_ID_TOKEN" ] || [ -n "$OLD_REFRESH_TOKEN" ] || [ -n "$OLD_GAME_ID" ] || [ -n "$OLD_API_URL" ]; then
    # Use a temporary file for safe editing
    TEMP_ENV=$(mktemp)
    cp "$ROOT_ENV" "$TEMP_ENV"
    
    # Update values in temp file
    if [ -n "$OLD_ID_TOKEN" ]; then
      sed -i.bak "s|^ID_TOKEN=.*|ID_TOKEN=$OLD_ID_TOKEN|" "$TEMP_ENV" 2>/dev/null || \
      sed -i '' "s|^ID_TOKEN=.*|ID_TOKEN=$OLD_ID_TOKEN|" "$TEMP_ENV"
    fi
    if [ -n "$OLD_REFRESH_TOKEN" ]; then
      sed -i.bak "s|^REFRESH_TOKEN=.*|REFRESH_TOKEN=$OLD_REFRESH_TOKEN|" "$TEMP_ENV" 2>/dev/null || \
      sed -i '' "s|^REFRESH_TOKEN=.*|REFRESH_TOKEN=$OLD_REFRESH_TOKEN|" "$TEMP_ENV"
    fi
    if [ -n "$OLD_GAME_ID" ] && [ "$OLD_GAME_ID" != "paste-game-id-here" ]; then
      sed -i.bak "s|^GAME_ID=.*|GAME_ID=$OLD_GAME_ID|" "$TEMP_ENV" 2>/dev/null || \
      sed -i '' "s|^GAME_ID=.*|GAME_ID=$OLD_GAME_ID|" "$TEMP_ENV"
    fi
    if [ -n "$OLD_API_URL" ]; then
      sed -i.bak "s|^API_URL=.*|API_URL=$OLD_API_URL|" "$TEMP_ENV" 2>/dev/null || \
      sed -i '' "s|^API_URL=.*|API_URL=$OLD_API_URL|" "$TEMP_ENV"
    fi
    
    # Remove backup files if created
    rm -f "$TEMP_ENV.bak"
    
    # Replace .env with updated version
    mv "$TEMP_ENV" "$ROOT_ENV"
    echo "✓ Migrated tokens from .env.api-test to .env"
    
    # Optionally remove .env.api-test (user can delete manually if they want)
    echo "  (You can now delete .env.api-test if you want - tokens are in .env)"
  fi
fi

echo ""
echo "Building Next.js apps (npm install && npm run build)..."

BUILD_LOG_DIR="$PROJECT_ROOT/.setup-logs"
mkdir -p "$BUILD_LOG_DIR"

run_step() {
  local name="$1"
  local dir="$2"
  local env_file="$3"
  shift 3
  local log_file="$BUILD_LOG_DIR/${name// /-}.log"
  local cmd=("$@")

  echo ""
  echo "▶ $name"
  echo "   logs -> $log_file"

  if (
    cd "$dir" && \
    {
      if [ -n "$env_file" ]; then
        set -a
        source "$env_file"
        set +a
      fi
      "${cmd[@]}"
    }
  ) >"$log_file" 2>&1; then
    echo "   ✓ Completed"
  else
    echo "   ✗ Failed (showing last 20 lines)"
    tail -n 20 "$log_file"
    echo "   Full log: $log_file"
    exit 1
  fi
}

# Install dependencies first (without NODE_ENV=production to ensure devDependencies are installed)
# Temporarily unset NODE_ENV if it's set to production
OLD_NODE_ENV="$NODE_ENV"
unset NODE_ENV
run_step "app npm install" "$PROJECT_ROOT" "" npm install --legacy-peer-deps
export NODE_ENV="$OLD_NODE_ENV"

# Verify tailwindcss is installed
if [ ! -d "$PROJECT_ROOT/node_modules/tailwindcss" ]; then
  echo ""
  echo "⚠️  tailwindcss not found after npm install, forcing reinstall..."
  unset NODE_ENV
  run_step "app npm install tailwindcss" "$PROJECT_ROOT" "" npm install --legacy-peer-deps 'tailwindcss@^3.4.0' postcss autoprefixer
  export NODE_ENV="$OLD_NODE_ENV"
fi

# Clean .next directory to avoid stale build cache issues  
run_step "app clean" "$PROJECT_ROOT" "" rm -rf .next

# Set environment variables for build from root .env file
set -a
source "$ROOT_ENV"
set +a

run_step "app build" "$PROJECT_ROOT" "$ROOT_ENV" npm run build

cd "$PROJECT_ROOT"

echo ""
echo "✓ Next.js builds completed (logs in $BUILD_LOG_DIR)"

# Step 7: Display summary
echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Created/updated environment files:"
echo "  • .env - All environment variables (Docker Compose, AWS, DynamoDB, and API test tokens)"
echo ""

if [ -n "$COGNITO_POOL_ID" ] && [ -n "$COGNITO_CLIENT_ID" ]; then
  echo "✓ Cognito values populated from Terraform"
else
  echo "⚠️  Cognito values not found - you may need to set them manually:"
  echo "   Edit .env and set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and COGNITO_DOMAIN"
fi

echo ""
echo "Next steps:"
echo "1. Verify the environment files above look correct"
echo "2. (Optional) Re-run builds with npm install && npm run build if dependencies change"
echo "3. Start Docker services:"
echo "   docker compose up --build"
echo ""
