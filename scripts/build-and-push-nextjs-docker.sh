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

# Build Next.js app first to generate static files
echo ""
echo "Building Next.js app to generate static files..."
cd "$PROJECT_ROOT"
npm ci --legacy-peer-deps
npm run build

# Deploy static assets to S3
echo ""
echo "Deploying static assets to S3..."
cd "$PROJECT_ROOT"
bash scripts/deploy-static-assets.sh "$STAGE"

# Login to ECR
echo ""
echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build and push app
echo "Building app image..."
cd "$PROJECT_ROOT"
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${SERVICE_NAME}-game"
IMAGE_TAG="latest"
TIMESTAMP_TAG="$(date +%Y%m%d-%H%M%S)"

# Build for x86_64 architecture (Lambda's default)
# Use project root as build context
# Per AWS Lambda docs: use docker buildx with --provenance=false and --sbom=false
# These flags prevent OCI index manifests that Lambda doesn't support
# --load outputs to local Docker daemon for tagging/pushing
# This creates Docker Image Manifest V2 Schema 2 format (single-arch) compatible with Lambda
docker buildx build --platform linux/amd64 --provenance=false --sbom=false --load -f Dockerfile -t "${ECR_REPO}:${IMAGE_TAG}" .
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_REPO}:${TIMESTAMP_TAG}"

echo "Pushing game image..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:${TIMESTAMP_TAG}"

# Get the Docker v2 manifest digest (Lambda requires Docker v2, not OCI)
# When using DOCKER_BUILDKIT=0, the image should be Docker v2 format
echo ""
echo "Getting Docker v2 manifest digest..."
IMAGE_DIGEST=$(aws ecr describe-images --repository-name "${SERVICE_NAME}-game" --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
if [ -n "$IMAGE_DIGEST" ]; then
  echo "Image digest: $IMAGE_DIGEST"
  echo "To use this in Terraform, update image_uri to: ${ECR_REPO}@${IMAGE_DIGEST}"
else
  echo "Warning: Could not get image digest"
fi

echo "Docker images built and pushed successfully!"

