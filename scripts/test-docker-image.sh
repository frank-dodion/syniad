#!/bin/bash

# Test Docker image locally before pushing to ECR
# This script builds and tests a Next.js Docker image locally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if app name is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <scenario-editor|game>"
  exit 1
fi

APP_NAME="$1"

if [ "$APP_NAME" != "scenario-editor" ] && [ "$APP_NAME" != "game" ]; then
  echo "Error: App name must be 'scenario-editor' or 'game'"
  exit 1
fi

APP_DIR="$PROJECT_ROOT/frontend/$APP_NAME"
IMAGE_NAME="syniad-test-$APP_NAME"
CONTAINER_NAME="syniad-test-$APP_NAME-container"

echo "=========================================="
echo "Testing Docker image for: $APP_NAME"
echo "=========================================="

# Clean up any existing container
echo "Cleaning up any existing test container..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Ensure buildx is available - install if needed (for Colima)
if ! docker buildx version >/dev/null 2>&1; then
  echo "buildx not found, installing..."
  
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
  echo "Downloading buildx ${BUILDX_VERSION} for ${ARCH}..."
  curl -L -o ~/.docker/cli-plugins/docker-buildx \
    "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.darwin-${ARCH}" 2>/dev/null
  
  if [ $? -eq 0 ] && [ -f ~/.docker/cli-plugins/docker-buildx ]; then
    chmod +x ~/.docker/cli-plugins/docker-buildx
    echo "✓ buildx installed successfully"
  else
    echo "❌ Failed to install buildx, falling back to legacy docker build"
    echo "(Note: This will show a deprecation warning, but will still work)"
    cd "$APP_DIR"
    docker build --platform linux/amd64 -t "$IMAGE_NAME" .
    if [ $? -ne 0 ]; then
      echo "❌ Docker build failed!"
      exit 1
    fi
    echo "✓ Docker image built successfully"
    exit 0
  fi
fi

# Create buildx builder instance if needed
if ! docker buildx ls | grep -q "default"; then
  echo "Creating buildx builder instance..."
  docker buildx create --name default --use 2>/dev/null || docker buildx use default 2>/dev/null || true
fi

# Build Docker image using buildx
echo ""
echo "Building Docker image..."
cd "$APP_DIR"
docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" --load .

if [ $? -ne 0 ]; then
  echo "❌ Docker build failed!"
  exit 1
fi

echo "✅ Docker image built successfully"

# Run container in background
# Override entrypoint to run Next.js server directly (Lambda entrypoint expects handler)
# The WORKDIR in Dockerfile is /var/task/frontend/scenario-editor (or game)
echo ""
echo "Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --entrypoint="" \
  -p 8080:8080 \
  -e PORT=8080 \
  -e NEXT_PUBLIC_API_URL="http://localhost:3000" \
  -e NEXT_PUBLIC_FRONTEND_URL="http://localhost:8080" \
  -e NEXTAUTH_URL="http://localhost:8080" \
  -e BETTER_AUTH_SECRET="test-secret-for-local-testing" \
  -e COGNITO_USER_POOL_ID="test-pool-id" \
  -e COGNITO_CLIENT_ID="test-client-id" \
  -e COGNITO_CLIENT_SECRET="" \
  -e COGNITO_REGION="us-east-1" \
  -e COGNITO_DOMAIN="test-domain.auth.us-east-1.amazoncognito.com" \
  -w "/var/task" \
  "$IMAGE_NAME" \
  sh -c "node server.js"

if [ $? -ne 0 ]; then
  echo "❌ Failed to start container!"
  exit 1
fi

# Wait for container to be ready (Next.js needs time to start)
echo "Waiting for container to be ready..."
sleep 10

# Check if container is still running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "❌ Container stopped unexpectedly!"
  echo "Container logs:"
  docker logs "$CONTAINER_NAME"
  echo ""
  echo "Checking directory structure..."
  docker run --rm --entrypoint="" "$IMAGE_NAME" ls -la "/var/task/frontend/$APP_NAME/" 2>/dev/null || \
  docker run --rm --entrypoint="" "$IMAGE_NAME" find /var/task -name "server.js" 2>/dev/null || \
  docker run --rm --entrypoint="" "$IMAGE_NAME" find /var/task -type f | head -20 || true
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  exit 1
fi

# Test HTTP endpoint
echo ""
echo "Testing HTTP endpoint..."
MAX_RETRIES=10
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ || echo "000")
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "302" ]; then
    SUCCESS=true
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  Attempt $RETRY_COUNT/$MAX_RETRIES: Got HTTP $HTTP_CODE, retrying..."
  sleep 2
done

# Clean up
echo ""
echo "Cleaning up..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Report results
echo ""
if [ "$SUCCESS" = true ]; then
  echo "✅ Test passed! Docker image is working correctly."
  echo "   HTTP endpoint responded with status code: $HTTP_CODE"
  exit 0
else
  echo "❌ Test failed! HTTP endpoint did not respond correctly."
  echo "   Last HTTP status code: $HTTP_CODE"
  exit 1
fi

