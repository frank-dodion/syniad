#!/bin/bash

# Build Next.js apps for Lambda deployment
# This script builds both scenario-editor and game apps

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building Next.js applications for Lambda..."

# Build scenario-editor
echo "Building scenario-editor..."
cd "$PROJECT_ROOT/frontend/scenario-editor"
npm install
npm run build

# Build game
echo "Building game..."
cd "$PROJECT_ROOT/frontend/game"
npm install
npm run build

echo "Next.js builds completed successfully!"

