#!/bin/bash
set -e

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Create Lambda package directories
echo "Preparing Lambda packages..."
mkdir -p .build/lambda-packages/test
mkdir -p .build/lambda-packages/createGame
mkdir -p .build/lambda-packages/joinGame
mkdir -p .build/lambda-packages/getGame

# Copy compiled handlers and fix import paths
# Fix paths from ../lib/db to ./lib/db and ../shared to ./shared
sed 's|require("../lib/|require("./lib/|g; s|require("../shared/|require("./shared/|g' .build/handlers/test.js > .build/lambda-packages/test/index.js
sed 's|require("../lib/|require("./lib/|g; s|require("../shared/|require("./shared/|g' .build/handlers/createGame.js > .build/lambda-packages/createGame/index.js
sed 's|require("../lib/|require("./lib/|g; s|require("../shared/|require("./shared/|g' .build/handlers/joinGame.js > .build/lambda-packages/joinGame/index.js
sed 's|require("../lib/|require("./lib/|g; s|require("../shared/|require("./shared/|g' .build/handlers/getGame.js > .build/lambda-packages/getGame/index.js

# Copy shared code
cp -r .build/lib .build/lambda-packages/test/lib 2>/dev/null || true
cp -r .build/lib .build/lambda-packages/createGame/lib 2>/dev/null || true
cp -r .build/lib .build/lambda-packages/joinGame/lib 2>/dev/null || true
cp -r .build/lib .build/lambda-packages/getGame/lib 2>/dev/null || true
cp -r .build/shared .build/lambda-packages/test/shared 2>/dev/null || true
cp -r .build/shared .build/lambda-packages/createGame/shared 2>/dev/null || true
cp -r .build/shared .build/lambda-packages/joinGame/shared 2>/dev/null || true
cp -r .build/shared .build/lambda-packages/getGame/shared 2>/dev/null || true

# Fix import paths in lib files too (they might import from shared)
find .build/lambda-packages -name "*.js" -type f -exec sed -i '' 's|require("../shared/|require("./shared/|g' {} + 2>/dev/null || true

# Copy package.json and install dependencies
cp package.json .build/lambda-packages/test/
cp package.json .build/lambda-packages/createGame/
cp package.json .build/lambda-packages/joinGame/
cp package.json .build/lambda-packages/getGame/

echo "Installing production dependencies..."
cd .build/lambda-packages/test && npm install --production --no-save --silent
cd ../createGame && npm install --production --no-save --silent
cd ../joinGame && npm install --production --no-save --silent
cd ../getGame && npm install --production --no-save --silent
cd ../../..

echo "Lambda packages ready in .build/lambda-packages/"

