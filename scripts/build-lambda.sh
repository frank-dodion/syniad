#!/bin/bash
set -e

# Accept optional argument to build specific lambda (or "all" for all)
TARGET_LAMBDA="${1:-all}"

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Lambda names
LAMBDAS=("test" "createScenario" "getScenarios" "updateScenario" "deleteScenario" "createGame" "joinGame" "getGame" "deleteGame" "getAllGames" "authorizer" "docs")

# Create Lambda package directories
echo "Preparing Lambda packages..."
mkdir -p .build/lambda-packages/test
mkdir -p .build/lambda-packages/createGame
mkdir -p .build/lambda-packages/joinGame
mkdir -p .build/lambda-packages/createScenario
mkdir -p .build/lambda-packages/getScenarios
mkdir -p .build/lambda-packages/updateScenario
mkdir -p .build/lambda-packages/deleteScenario
mkdir -p .build/lambda-packages/getGame
mkdir -p .build/lambda-packages/deleteGame
mkdir -p .build/lambda-packages/getAllGames
mkdir -p .build/lambda-packages/authorizer
mkdir -p .build/lambda-packages/docs
# Auth proxy removed - Better Auth handles authentication in Next.js

# Function to build a specific lambda
build_lambda() {
  local lambda_name="$1"
  local handler_name="${lambda_name}"
  
  # Handle camelCase mapping (handler files use camelCase)
  # The handler_name matches the file name in handlers/ directory
  case "$lambda_name" in
    "createScenario") handler_name="createScenario" ;;
    "getScenarios") handler_name="getScenarios" ;;
    "updateScenario") handler_name="updateScenario" ;;
    "deleteScenario") handler_name="deleteScenario" ;;
    "createGame") handler_name="createGame" ;;
    "joinGame") handler_name="joinGame" ;;
    "getGame") handler_name="getGame" ;;
    "deleteGame") handler_name="deleteGame" ;;
    "getAllGames") handler_name="getAllGames" ;;
    "authorizer") handler_name="authorizer" ;;
    "test") handler_name="test" ;;
    "docs") handler_name="docs" ;;
    *) handler_name="$lambda_name" ;;
  esac
  
  echo "Building Lambda: $lambda_name"
  
  # Copy compiled handler and fix import paths
  sed 's|require("../lib/|require("./lib/|g; s|require("../shared/|require("./shared/|g' ".build/handlers/${handler_name}.js" > ".build/lambda-packages/${lambda_name}/index.js"
  
  # Copy shared code (remove existing first to avoid nesting)
  rm -rf ".build/lambda-packages/${lambda_name}/lib" ".build/lambda-packages/${lambda_name}/shared"
  cp -r .build/lib ".build/lambda-packages/${lambda_name}/lib" 2>/dev/null || true
  cp -r .build/shared ".build/lambda-packages/${lambda_name}/shared" 2>/dev/null || true
  
  # Copy OpenAPI spec for docs handler
  if [ "$lambda_name" = "docs" ]; then
    mkdir -p ".build/lambda-packages/${lambda_name}/docs"
    cp docs/openapi.yaml ".build/lambda-packages/${lambda_name}/docs/openapi.yaml" 2>/dev/null || true
  fi
  
  # Fix import paths in lib files too (they might import from shared)
  find ".build/lambda-packages/${lambda_name}" -name "*.js" -type f -exec sed -i '' 's|require("../shared/|require("./shared/|g' {} + 2>/dev/null || true
  
  # Copy package.json and install dependencies
  cp package.json ".build/lambda-packages/${lambda_name}/"
  
  echo "Installing dependencies for $lambda_name..."
  cd ".build/lambda-packages/${lambda_name}" && npm install --production --no-save --silent
  cd ../../..
  
  echo "✓ $lambda_name package ready"
}

# Build all or specific lambda
if [ "$TARGET_LAMBDA" = "all" ]; then
  echo "Building all Lambda functions..."
  for lambda in "${LAMBDAS[@]}"; do
    build_lambda "$lambda"
  done
  echo ""
  echo "✓ All Lambda packages ready in .build/lambda-packages/"
else
  # Check if target lambda exists
  if [[ " ${LAMBDAS[@]} " =~ " ${TARGET_LAMBDA} " ]]; then
    build_lambda "$TARGET_LAMBDA"
  else
    echo "Error: Unknown lambda '$TARGET_LAMBDA'"
    echo "Available lambdas: ${LAMBDAS[*]}"
    exit 1
  fi
fi
