#!/bin/bash

# Package Next.js apps for Lambda deployment with AWS Lambda Web Adapter
# Creates deployment packages ready for Lambda

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_DIR="$PROJECT_ROOT/lambda-packages"

# Create lambda packages directory
mkdir -p "$LAMBDA_DIR"

echo "Packaging Next.js apps for Lambda..."

# Package scenario-editor
echo "Packaging scenario-editor..."
cd "$PROJECT_ROOT/frontend/scenario-editor"

# Create package directory
PACKAGE_DIR="$LAMBDA_DIR/scenario-editor"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy standalone output
cp -r .next/standalone/* "$PACKAGE_DIR/"
# Ensure .next directory exists before copying static files
mkdir -p "$PACKAGE_DIR/.next"
cp -r .next/static "$PACKAGE_DIR/.next/static"
cp -r public "$PACKAGE_DIR/public" 2>/dev/null || true

# Create bootstrap script for Lambda Web Adapter
# Next.js standalone output has server.js at frontend/scenario-editor/server.js
# When AWS_LAMBDA_EXEC_WRAPPER is set, Lambda uses /opt/bootstrap (Web Adapter) as wrapper
# Our bootstrap script is executed by the wrapper, which provides Node.js
# Use /usr/bin/node or let the wrapper find node
cat > "$PACKAGE_DIR/bootstrap" << 'EOF'
#!/bin/sh
cd /var/task/frontend/scenario-editor
# Try different node paths - Web Adapter should provide node in PATH
exec node server.js || exec /usr/bin/node server.js || exec /opt/bootstrap/node server.js
EOF
chmod +x "$PACKAGE_DIR/bootstrap"

# Create zip file
cd "$PACKAGE_DIR"
zip -r "$LAMBDA_DIR/scenario-editor.zip" . -q

echo "Created $LAMBDA_DIR/scenario-editor.zip"

# Package game
echo "Packaging game..."
cd "$PROJECT_ROOT/frontend/game"

# Create package directory
PACKAGE_DIR="$LAMBDA_DIR/game"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy standalone output
cp -r .next/standalone/* "$PACKAGE_DIR/"
# Ensure .next directory exists before copying static files
mkdir -p "$PACKAGE_DIR/.next"
cp -r .next/static "$PACKAGE_DIR/.next/static"
cp -r public "$PACKAGE_DIR/public" 2>/dev/null || true

# Create bootstrap script for Lambda Web Adapter
# Next.js standalone output has server.js at frontend/game/server.js
# When AWS_LAMBDA_EXEC_WRAPPER is set, Lambda uses /opt/bootstrap (Web Adapter) as wrapper
# Our bootstrap script is executed by the wrapper, which provides Node.js
# Use /usr/bin/node or let the wrapper find node
cat > "$PACKAGE_DIR/bootstrap" << 'EOF'
#!/bin/sh
cd /var/task/frontend/game
# Try different node paths - Web Adapter should provide node in PATH
exec node server.js || exec /usr/bin/node server.js || exec /opt/bootstrap/node server.js
EOF
chmod +x "$PACKAGE_DIR/bootstrap"

# Create zip file
cd "$PACKAGE_DIR"
zip -r "$LAMBDA_DIR/game.zip" . -q

echo "Created $LAMBDA_DIR/game.zip"

echo "Packaging completed!"

