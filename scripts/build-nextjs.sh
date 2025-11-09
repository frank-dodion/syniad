#!/bin/bash

# Build Next.js apps for Lambda deployment
# This script builds both scenario-editor and game apps

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building Next.js application for Lambda..."

# Build app (includes game and scenario editor) with locked deps
echo "Building app..."
cd "$PROJECT_ROOT"
npm ci --legacy-peer-deps
npm run build

echo "Next.js build completed successfully!"

