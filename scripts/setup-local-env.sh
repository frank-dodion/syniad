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

# Step 2: Get Cognito values from Terraform
echo ""
echo "Attempting to get Cognito values from Terraform..."
cd "$PROJECT_ROOT/terraform"

COGNITO_POOL_ID=""
COGNITO_CLIENT_ID=""
COGNITO_DOMAIN=""
COGNITO_REGION="us-east-1"

if terraform output -json > /dev/null 2>&1; then
  COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
  COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
  COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
  COGNITO_REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")
  
  if [ -n "$COGNITO_POOL_ID" ] && [ -n "$COGNITO_CLIENT_ID" ]; then
    echo "✓ Found Cognito values from Terraform:"
    echo "  User Pool ID: $COGNITO_POOL_ID"
    echo "  Client ID: $COGNITO_CLIENT_ID"
    echo "  Domain: $COGNITO_DOMAIN"
    echo "  Region: $COGNITO_REGION"
  else
    echo "⚠️  Could not get all Cognito values from Terraform"
  fi
else
  echo "⚠️  Terraform not initialized or outputs not available"
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
# This single .env file contains all variables for both apps
# Docker Compose automatically reads this file for variable substitution
# Do not commit secrets to git

# ============================================================================
# Build-time variables (for Docker build args)
# NEXT_PUBLIC_* vars are embedded at build time during npm run build
# ============================================================================
NEXT_PUBLIC_FRONTEND_URL_SCENARIO_EDITOR=http://localhost:3001
NEXT_PUBLIC_FRONTEND_URL_GAME=http://localhost:3002
NEXT_PUBLIC_API_URL=http://localhost:3000

# ============================================================================
# Runtime variables (shared by both apps)
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

# ============================================================================
# App-specific runtime variables
# ============================================================================
# Scenario Editor
NEXTAUTH_URL_SCENARIO_EDITOR=http://localhost:3001

# Game
NEXTAUTH_URL_GAME=http://localhost:3002
EOF
echo "✓ Created root .env file"

echo ""
echo "----- .env -----"
cat "$ROOT_ENV"
echo "----------------"

# Step 6: Ensure .env.api-test exists (ONLY REST Client variables)
if [ ! -f "$API_TEST_ENV" ]; then
  echo ""
  echo "Creating .env.api-test..."
  cat > "$API_TEST_ENV" << EOF
# REST Client Test Credentials
# This file is used by REST Client .http files and test scripts
# Do not commit tokens to git

API_URL=https://dev.api.syniad.net
ID_TOKEN=
REFRESH_TOKEN=
GAME_ID=paste-game-id-here
EOF
  echo "✓ Created .env.api-test (empty - run ./scripts/test-cognito-auth.sh to populate)"
else
  echo ""
  echo "✓ .env.api-test already exists (preserving existing tokens)"
fi

echo ""
echo "----- .env.api-test -----"
cat "$API_TEST_ENV"
echo "--------------------------"

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

# Set environment variables for builds from root .env file
set -a
source "$ROOT_ENV"
set +a

run_step "scenario-editor npm install" "$PROJECT_ROOT/frontend/scenario-editor" "" npm install --silent
run_step "scenario-editor build" "$PROJECT_ROOT/frontend/scenario-editor" "$ROOT_ENV" npm run build --silent
run_step "game npm install" "$PROJECT_ROOT/frontend/game" "" npm install --silent
run_step "game build" "$PROJECT_ROOT/frontend/game" "$ROOT_ENV" npm run build --silent

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
echo "  • .env          - All environment variables for Docker Compose (build args + runtime)"
echo "  • .env.api-test - REST Client test tokens"
echo ""

if [ -n "$COGNITO_POOL_ID" ] && [ -n "$COGNITO_CLIENT_ID" ]; then
  echo "✓ Cognito values populated from Terraform"
else
  echo "⚠️  Cognito values not found - you may need to set them manually:"
  echo "   Edit .env.scenario-editor and .env.game"
fi

echo ""
echo "Next steps:"
echo "1. Verify the environment files above look correct"
echo "2. (Optional) Re-run builds with npm install && npm run build if dependencies change"
echo "3. Start Docker services:"
echo "   docker-compose up --build"
echo ""
