#!/bin/bash

# Deploy static assets to S3 for Next.js apps
# Usage: ./scripts/deploy-static-assets.sh [stage] [app]
# stage: dev or prod (default: dev)
# app: scenario-editor or game (default: both)

set -e

STAGE=${1:-dev}
APP=${2:-both}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get bucket names from Terraform output
cd "$PROJECT_ROOT/terraform"
BUCKET_SCENARIO_EDITOR=$(terraform output -raw scenario_editor_static_bucket_name 2>/dev/null || echo "")
BUCKET_GAME=$(terraform output -raw game_static_bucket_name 2>/dev/null || echo "")

if [ -z "$BUCKET_SCENARIO_EDITOR" ] || [ -z "$BUCKET_GAME" ]; then
  echo "Error: Could not get bucket names from Terraform. Make sure Terraform has been applied."
  exit 1
fi

echo "Deploying static assets to S3..."

# Deploy scenario-editor static assets
if [ "$APP" = "both" ] || [ "$APP" = "scenario-editor" ]; then
  echo "Deploying scenario-editor static assets to s3://$BUCKET_SCENARIO_EDITOR..."
  cd "$PROJECT_ROOT/frontend/scenario-editor"
  
  if [ -d ".next/static" ]; then
    aws s3 sync .next/static s3://$BUCKET_SCENARIO_EDITOR/_next/static --delete
    echo "✓ Scenario editor static assets deployed"
  else
    echo "Warning: .next/static directory not found. Run 'npm run build' first."
  fi
fi

# Deploy game static assets
if [ "$APP" = "both" ] || [ "$APP" = "game" ]; then
  echo "Deploying game static assets to s3://$BUCKET_GAME..."
  cd "$PROJECT_ROOT/frontend/game"
  
  if [ -d ".next/static" ]; then
    aws s3 sync .next/static s3://$BUCKET_GAME/_next/static --delete
    echo "✓ Game static assets deployed"
  else
    echo "Warning: .next/static directory not found. Run 'npm run build' first."
  fi
fi

echo "Static assets deployment completed!"

