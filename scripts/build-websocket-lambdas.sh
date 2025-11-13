#!/bin/bash

# Build script for WebSocket Lambda handlers and Cognito triggers
# Installs dependencies and prepares zip files for deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HANDLERS_DIR="$PROJECT_ROOT/lambda-handlers"

echo "Building Lambda handlers..."

# Build WebSocket handlers
for handler in websocket-connect websocket-disconnect websocket-message; do
  echo "Building $handler..."
  cd "$HANDLERS_DIR/$handler"
  
  # Install dependencies
  if [ -f "package.json" ]; then
    npm install --production
  fi
  
  # Remove node_modules if zip already exists (will be recreated by Terraform)
  if [ -f "../${handler}.zip" ]; then
    rm -f "../${handler}.zip"
  fi
done

# Build Cognito PreSignUp handler
echo "Building cognito-presignup..."
cd "$HANDLERS_DIR/cognito-presignup"

# Install dependencies
if [ -f "package.json" ]; then
  npm install --production
fi

# Remove node_modules if zip already exists (will be recreated by Terraform)
if [ -f "../cognito-presignup.zip" ]; then
  rm -f "../cognito-presignup.zip"
fi

echo "Lambda handlers built successfully!"

