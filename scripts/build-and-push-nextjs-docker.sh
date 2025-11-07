#!/bin/bash

# Build and push Next.js Docker images to ECR for Lambda deployment
# This script builds Docker images and pushes them to ECR repositories

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get AWS account ID and region from Terraform
cd "$PROJECT_ROOT/terraform"
AWS_ACCOUNT_ID=$(terraform output -raw aws_account_id 2>/dev/null || aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")
STAGE=$(terraform output -raw stage 2>/dev/null || echo "dev")

SERVICE_NAME="syniad-${STAGE}"

echo "Building and pushing Next.js Docker images..."
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Stage: $STAGE"

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build and push scenario-editor
echo "Building scenario-editor image..."
cd "$PROJECT_ROOT/frontend/scenario-editor"
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${SERVICE_NAME}-scenario-editor"
IMAGE_TAG="latest"

docker build -t "${ECR_REPO}:${IMAGE_TAG}" .
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_REPO}:$(date +%Y%m%d-%H%M%S)"

echo "Pushing scenario-editor image..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:$(date +%Y%m%d-%H%M%S)"

# Build and push game
echo "Building game image..."
cd "$PROJECT_ROOT/frontend/game"
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${SERVICE_NAME}-game"

docker build -t "${ECR_REPO}:${IMAGE_TAG}" .
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_REPO}:$(date +%Y%m%d-%H%M%S)"

echo "Pushing game image..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:$(date +%Y%m%d-%H%M%S)"

echo "Docker images built and pushed successfully!"

