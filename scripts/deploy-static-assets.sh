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

# Always extract from Docker image to ensure build IDs match
# The Docker image is built with correct NEXT_PUBLIC_FRONTEND_URL via build-and-push-nextjs-docker.sh
# Local builds may have different environment variables, causing build ID mismatches
echo "Extracting static assets from Docker image to ensure build ID matches Lambda..."
  
# Determine AWS account and region
AWS_ACCOUNT_ID=$(terraform output -raw aws_account_id 2>/dev/null || aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

ECR_IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/syniad-${STAGE}-game:latest"

# Check if image exists locally, if not pull from ECR
if ! docker image inspect "$ECR_IMAGE" >/dev/null 2>&1; then
  echo "Docker image not found locally, pulling from ECR..."
  # Login to ECR
  aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  # Pull the image
  docker pull "$ECR_IMAGE"
fi

# Extract static assets from Docker image
EXTRACT_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t "next-static")
CONTAINER_ID=$(docker create "$ECR_IMAGE")
docker cp "${CONTAINER_ID}:/var/task/.next/static" "${EXTRACT_DIR}/static"
docker rm "$CONTAINER_ID" >/dev/null
STATIC_SOURCE="${EXTRACT_DIR}/static"

echo "Deploying app static assets to s3://$BUCKET_GAME..."
aws s3 sync "$STATIC_SOURCE" "s3://${BUCKET_GAME}/_next/static"
echo "✓ App static assets deployed"

# Clean up temporary directory if we created one
if [ -n "$EXTRACT_DIR" ] && [ -d "$EXTRACT_DIR" ]; then
  rm -rf "$EXTRACT_DIR"
fi

echo "Static assets deployment completed!"

