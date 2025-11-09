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

# Determine AWS account and region (needed to locate local Docker image)
AWS_ACCOUNT_ID=$(terraform output -raw aws_account_id 2>/dev/null || aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

LOCAL_IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/syniad-${STAGE}-game:latest"

echo "Preparing static assets from Docker image ${LOCAL_IMAGE}..."

if ! docker image inspect "$LOCAL_IMAGE" >/dev/null 2>&1; then
  echo "Error: Docker image ${LOCAL_IMAGE} not found locally. Run the deployment build step first."
  exit 1
fi

EXTRACT_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t "next-static")
CONTAINER_ID=$(docker create "$LOCAL_IMAGE")
docker cp "${CONTAINER_ID}:/var/task/.next/static" "${EXTRACT_DIR}/static"
docker rm "$CONTAINER_ID" >/dev/null

echo "Deploying app static assets to s3://$BUCKET_GAME..."
aws s3 sync "${EXTRACT_DIR}/static" "s3://${BUCKET_GAME}/_next/static"
echo "✓ App static assets deployed"

rm -rf "$EXTRACT_DIR"

echo "Static assets deployment completed!"

