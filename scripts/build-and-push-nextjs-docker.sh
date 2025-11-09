#!/bin/bash

# Build and push Next.js Docker images to ECR for Lambda deployment
# This script builds Docker images and pushes them to ECR repositories

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine target stage (argument takes precedence, then Terraform output, default dev)
REQUESTED_STAGE=${1:-}

# Get AWS account ID and region from Terraform
cd "$PROJECT_ROOT/terraform"

if [ -n "$REQUESTED_STAGE" ]; then
  STAGE="$REQUESTED_STAGE"
  terraform workspace select "$STAGE" 2>/dev/null || terraform workspace new "$STAGE"
else
  STAGE=$(terraform output -raw stage 2>/dev/null || echo "dev")
  terraform workspace select "$STAGE" 2>/dev/null || true
fi

AWS_ACCOUNT_ID=$(terraform output -raw aws_account_id 2>/dev/null || aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

SERVICE_NAME="syniad-${STAGE}"

# Get frontend URL from Terraform output (matches terraform/locals.tf logic)
# This ensures the build-time variable matches the runtime configuration
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")
if [ -z "$FRONTEND_URL" ]; then
  # Fallback: calculate from stage (matching terraform/locals.tf logic)
  DOMAIN_NAME=$(terraform output -raw domain_name 2>/dev/null || echo "syniad.net")
  if [ "$STAGE" = "prod" ]; then
    FRONTEND_DOMAIN="$DOMAIN_NAME"
  else
    FRONTEND_DOMAIN="${STAGE}.${DOMAIN_NAME}"
  fi
  FRONTEND_URL="https://${FRONTEND_DOMAIN}"
fi

echo "Building and pushing Next.js Docker images..."
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Stage: $STAGE"
echo "Frontend URL: $FRONTEND_URL"

# Pre-pull Lambda adapter image to avoid rate limits during Docker build
echo ""
echo "Pre-pulling Lambda adapter image to avoid rate limits..."
docker pull public.ecr.aws/awsguru/aws-lambda-adapter:0.6.0 || echo "Warning: Failed to pre-pull Lambda adapter, will try during build"

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
# Pass build args for Next.js public environment variables (embedded at build time)
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  --load \
  --build-arg NEXT_PUBLIC_FRONTEND_URL="${FRONTEND_URL}" \
  --build-arg NEXT_PUBLIC_API_URL="${FRONTEND_URL}" \
  -f Dockerfile \
  -t "${ECR_REPO}:${IMAGE_TAG}" \
  .
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

