#!/bin/bash

# Deploy static assets to S3 for Next.js app
# Usage: ./scripts/deploy-static-assets.sh [stage]
# stage: dev or prod (default: dev)

set -e

STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get bucket name from Terraform output
cd "$PROJECT_ROOT/terraform"
# Select the correct workspace before reading outputs
if [ "$STAGE" = "dev" ]; then
    echo "Switched to workspace \"dev\"."
    terraform workspace select dev 2>/dev/null || true
elif [ "$STAGE" = "prod" ]; then
    echo "Switched to workspace \"prod\"."
    terraform workspace select prod 2>/dev/null || true
fi
BUCKET_GAME=$(terraform output -raw game_static_bucket_name 2>/dev/null || echo "")

if [ -z "$BUCKET_GAME" ]; then
  echo "Error: Could not get bucket name from Terraform. Make sure Terraform has been applied."
  exit 1
fi

echo "Deploying static assets to S3..."

# Deploy app static assets
echo "Deploying app static assets to s3://$BUCKET_GAME..."
cd "$PROJECT_ROOT"

if [ -d ".next/static" ]; then
  aws s3 sync .next/static s3://$BUCKET_GAME/_next/static --delete
  echo "✓ App static assets deployed"
else
  echo "Warning: .next/static directory not found. Run 'npm run build' first."
fi

echo "Static assets deployment completed!"

