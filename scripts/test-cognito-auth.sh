#!/bin/bash
# Script to create a test user and get authentication token for API testing

# Don't use set -e, we'll handle errors explicitly
set -o pipefail  # Fail if any command in a pipeline fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Get configuration from Terraform outputs or user input
echo -e "${YELLOW}=== Cognito Authentication Helper ===${NC}\n"

# Try to get from Terraform outputs (works with S3 backend too)
if [ -d "terraform" ]; then
    echo "Attempting to get configuration from Terraform outputs..."
    
    cd terraform 2>/dev/null || exit 1
    
    # Try to get outputs (works regardless of state location - S3 or local)
    # Using command substitution to capture outputs
    USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
    CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
    REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "")
    
    # Always try to get API_URL (prefer custom domain, fallback to default)
    API_URL=$(terraform output -raw custom_domain_url 2>/dev/null || echo "")
    if [ -z "$API_URL" ]; then
        # Try alternate output names
        API_URL=$(terraform output -raw api_url 2>/dev/null || echo "")
    fi
    if [ -z "$API_URL" ]; then
        API_URL=$(terraform output -raw api_endpoint 2>/dev/null || echo "")
    fi
    
    cd .. 2>/dev/null || true
    
    if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ]; then
        echo -e "${GREEN}✓ Found Cognito configuration from Terraform${NC}"
        echo "  User Pool ID: $USER_POOL_ID"
        echo "  Client ID: $CLIENT_ID"
        echo "  Region: ${REGION:-us-east-1}"
        echo ""
    else
        echo -e "${YELLOW}⚠ Could not auto-detect from Terraform outputs${NC}"
        echo "  (This is OK - you can enter them manually)"
        echo ""
    fi
fi

# Prompt for missing values
if [ -z "$USER_POOL_ID" ]; then
    read -p "Enter Cognito User Pool ID: " USER_POOL_ID
fi

if [ -z "$CLIENT_ID" ]; then
    read -p "Enter Cognito Client ID: " CLIENT_ID
fi

if [ -z "$REGION" ]; then
    read -p "Enter AWS Region (default: us-east-1): " REGION
    REGION=${REGION:-us-east-1}
fi

# User credentials
# Note: Since Cognito User Pool uses email as username_attributes,
# the username will be the email address
read -p "Enter email for test user (this will be the username) (default: test@example.com): " EMAIL
EMAIL=${EMAIL:-test@example.com}

# Use email as username since Cognito is configured with username_attributes = ["email"]
USERNAME="$EMAIL"

read -sp "Enter password (min 8 chars, uppercase, lowercase, number): " PASSWORD
echo ""

# Validate password
if [ ${#PASSWORD} -lt 8 ]; then
    echo -e "${RED}Error: Password must be at least 8 characters${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Creating/updating user...${NC}"

# Check if user exists
USER_EXISTS=$(aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --region "$REGION" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo -e "${YELLOW}User already exists, updating...${NC}"
    
    # User exists - confirm and set password
    aws cognito-idp admin-set-user-password \
      --user-pool-id "$USER_POOL_ID" \
      --username "$USERNAME" \
      --password "$PASSWORD" \
      --permanent \
      --region "$REGION" > /dev/null 2>&1 || {
        echo -e "${YELLOW}Failed to set password, attempting to confirm user first...${NC}"
        
        # Try to confirm the user
        aws cognito-idp admin-confirm-sign-up \
          --user-pool-id "$USER_POOL_ID" \
          --username "$USERNAME" \
          --region "$REGION" > /dev/null 2>&1 || true
        
        # Try setting password again
        aws cognito-idp admin-set-user-password \
          --user-pool-id "$USER_POOL_ID" \
          --username "$USERNAME" \
          --password "$PASSWORD" \
          --permanent \
          --region "$REGION" > /dev/null 2>&1 || {
            echo -e "${RED}Error: Failed to set password. Trying to create fresh user...${NC}"
            # Delete and recreate
            aws cognito-idp admin-delete-user \
              --user-pool-id "$USER_POOL_ID" \
              --username "$USERNAME" \
              --region "$REGION" > /dev/null 2>&1
        }
    }
else
    echo -e "${YELLOW}Creating new user...${NC}"
fi

# Create user if it doesn't exist or was deleted
CREATE_USER_OUTPUT=$(aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$REGION" 2>&1)

CREATE_USER_EXIT=$?
if [ $CREATE_USER_EXIT -ne 0 ]; then
    # Check if error is because user already exists
    if echo "$CREATE_USER_OUTPUT" | grep -q "User already exists"; then
        echo -e "${YELLOW}User already exists (that's OK, will update password)${NC}"
    else
        echo -e "${YELLOW}Note: User creation returned: $CREATE_USER_OUTPUT${NC}"
    fi
fi

# Set permanent password (always do this, even for new users)
SET_PASSWORD_OUTPUT=$(aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --password "$PASSWORD" \
  --permanent \
  --region "$REGION" 2>&1)

SET_PASSWORD_EXIT=$?
if [ $SET_PASSWORD_EXIT -ne 0 ]; then
    echo -e "${RED}Error: Failed to set password${NC}"
    echo "Error details: $SET_PASSWORD_OUTPUT"
    echo ""
    echo "This might be due to:"
    echo "  - Password doesn't meet policy requirements (min 8 chars, uppercase, lowercase, number)"
    echo "  - User is in an invalid state"
    echo ""
    echo "Try deleting the user first, then run this script again:"
    echo "  aws cognito-idp admin-delete-user --user-pool-id $USER_POOL_ID --username $USERNAME --region $REGION"
    exit 1
fi

echo -e "${GREEN}✓ User created/updated${NC}"

echo ""
echo -e "${YELLOW}Authenticating...${NC}"

# Authenticate and get tokens
# Try ADMIN_USER_PASSWORD_AUTH first (preferred for admin operations)
# If that fails, fall back to ADMIN_NO_SRP_AUTH
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
  --region "$REGION" 2>&1)

AUTH_EXIT=$?
if [ $AUTH_EXIT -ne 0 ]; then
    # Try alternative auth flow
    echo -e "${YELLOW}Trying alternative auth flow...${NC}"
    AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
      --user-pool-id "$USER_POOL_ID" \
      --client-id "$CLIENT_ID" \
      --auth-flow ADMIN_NO_SRP_AUTH \
      --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
      --region "$REGION" 2>&1)
    AUTH_EXIT=$?
fi

if [ $AUTH_EXIT -ne 0 ]; then
    echo -e "${RED}Error: Authentication failed${NC}"
    echo "$AUTH_RESPONSE"
    echo ""
    if echo "$AUTH_RESPONSE" | grep -q "Auth flow not enabled"; then
        echo -e "${YELLOW}The Cognito client needs to be updated to enable admin auth flows.${NC}"
        echo "Run: cd terraform && terraform apply"
        echo "This will update the client to allow ADMIN_USER_PASSWORD_AUTH flow."
    else
        echo "Possible solutions:"
        echo "1. The user might need to be confirmed first"
        echo "2. Check if the password meets Cognito requirements"
        echo "3. Try using the AWS Console to test the user manually"
    fi
    exit 1
fi

# Extract tokens (requires jq or manual parsing)
if command -v jq &> /dev/null; then
    ID_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.IdToken')
    ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.AccessToken')
    REFRESH_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.RefreshToken')
else
    # Fallback: use grep/sed (less reliable)
    ID_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"IdToken":"[^"]*' | cut -d'"' -f4)
    ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"AccessToken":"[^"]*' | cut -d'"' -f4)
    REFRESH_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"RefreshToken":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$ID_TOKEN" ] || [ "$ID_TOKEN" = "null" ]; then
    echo -e "${RED}Error: Failed to extract ID token${NC}"
    echo "Full response:"
    echo "$AUTH_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Authentication successful${NC}"

# Display results
echo ""
echo -e "${GREEN}=== Authentication Success ===${NC}"
echo ""

# Always show API URL (even if not from Terraform, show how to get it)
if [ -z "$API_URL" ]; then
    echo -e "${YELLOW}API URL:${NC}"
    echo "  Get it with: cd terraform && terraform output -raw api_url"
    echo "  Or: cd terraform && terraform output -raw api_endpoint"
    echo ""
else
    echo -e "${YELLOW}API URL:${NC}"
    echo "  $API_URL"
    echo ""
fi

if [ -n "$ID_TOKEN" ] && [ "$ID_TOKEN" != "null" ]; then
    echo -e "${YELLOW}ID Token (use this in Postman Authorization header):${NC}"
    echo "  $ID_TOKEN"
    echo ""
else
    echo -e "${RED}Error: ID Token is empty or null${NC}"
    echo "  Authentication may have failed"
    exit 1
fi

echo -e "${YELLOW}Postman Configuration:${NC}"
echo "1. In Postman, create a new environment"
echo "2. Add these variables:"
if [ -n "$API_URL" ]; then
    echo "   - 'api_url': $API_URL"
fi
echo "   - 'id_token': $ID_TOKEN"
echo ""
echo "3. For each request:"
echo "   - URL: {{api_url}}/endpoint"
echo "   - Header: Authorization: Bearer {{id_token}}"
echo ""
echo -e "${YELLOW}Or use Authorization tab:${NC}"
echo "- Type: Bearer Token"
echo "- Token: {{id_token}}"
echo ""

# Output machine-readable format for easy copying
echo -e "${YELLOW}--- Copy these values (or source from .env file) ---${NC}"
echo ""
echo "# To export these variables in your shell:"
echo "export API_URL=\"$API_URL\""
echo "export ID_TOKEN=\"$ID_TOKEN\""
if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
    echo "export REFRESH_TOKEN=\"$REFRESH_TOKEN\""
fi
echo ""

# Save to .env.api-test file for REST Client (gitignored, safe for tokens)
# REST scripts have pre-request scripts that read from this file before every request
# This ensures variables are always fresh - no caching issues!
# The .http files NEVER contain tokens - they use pre-request scripts to load from .env.api-test
# Note: .env is now reserved for Docker Compose configuration

# Get workspace root directory (where script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$WORKSPACE_ROOT/.env.api-test"

if [ -n "$ID_TOKEN" ] && [ "$ID_TOKEN" != "null" ]; then
    # Trim any whitespace/newlines from tokens
    ID_TOKEN=$(echo "$ID_TOKEN" | tr -d '\n\r' | xargs)
    if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
        REFRESH_TOKEN=$(echo "$REFRESH_TOKEN" | tr -d '\n\r' | xargs)
    fi
    
    # Create .env file with credentials
    # Use printf instead of cat to avoid any shell interpretation issues
    # Update .env file with tokens (preserve existing content)
    # Use a temporary file for safe editing
    TEMP_ENV=$(mktemp)
    cp "$ENV_FILE" "$TEMP_ENV" 2>/dev/null || touch "$TEMP_ENV"
    
    # Update or add ID_TOKEN
    if grep -q "^ID_TOKEN=" "$TEMP_ENV" 2>/dev/null; then
        sed -i.bak "s|^ID_TOKEN=.*|ID_TOKEN=$ID_TOKEN|" "$TEMP_ENV" 2>/dev/null || \
        sed -i '' "s|^ID_TOKEN=.*|ID_TOKEN=$ID_TOKEN|" "$TEMP_ENV"
    else
        # Find the API Testing section and add after it
        if grep -q "^# API Testing / REST Client Variables" "$TEMP_ENV" 2>/dev/null; then
            sed -i.bak "/^# API Testing \/ REST Client Variables/,/^LOCAL_MODE=/ { /^ID_TOKEN=/! { /^REFRESH_TOKEN=/! { /^GAME_ID=/! { /^API_URL=/! { /^LOCAL_MODE=/a\\
ID_TOKEN=$ID_TOKEN
} } } } }" "$TEMP_ENV" 2>/dev/null || \
            awk "/^# API Testing \/ REST Client Variables/,/^LOCAL_MODE=/ { print; if (/^API_URL=/) { print \"ID_TOKEN=$ID_TOKEN\" }; next } 1" "$TEMP_ENV" > "${TEMP_ENV}.tmp" && mv "${TEMP_ENV}.tmp" "$TEMP_ENV"
        else
            echo "ID_TOKEN=$ID_TOKEN" >> "$TEMP_ENV"
        fi
    fi
    
    # Update or add REFRESH_TOKEN
    if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
        if grep -q "^REFRESH_TOKEN=" "$TEMP_ENV" 2>/dev/null; then
            sed -i.bak "s|^REFRESH_TOKEN=.*|REFRESH_TOKEN=$REFRESH_TOKEN|" "$TEMP_ENV" 2>/dev/null || \
            sed -i '' "s|^REFRESH_TOKEN=.*|REFRESH_TOKEN=$REFRESH_TOKEN|" "$TEMP_ENV"
        else
            # Add after ID_TOKEN
            sed -i.bak "/^ID_TOKEN=/a\\
REFRESH_TOKEN=$REFRESH_TOKEN
" "$TEMP_ENV" 2>/dev/null || \
            awk "/^ID_TOKEN=/ { print; print \"REFRESH_TOKEN=$REFRESH_TOKEN\"; next } 1" "$TEMP_ENV" > "${TEMP_ENV}.tmp" && mv "${TEMP_ENV}.tmp" "$TEMP_ENV"
        fi
    fi
    
    # Remove backup files if created
    rm -f "$TEMP_ENV.bak"
    
    # Replace .env with updated version
    mv "$TEMP_ENV" "$ENV_FILE"
    
    echo -e "${GREEN}✓ Values saved to .env (gitignored)${NC}"
    echo "  REST Client .http files read from .env automatically"
    echo "  Bash scripts can source .env file (no caching!)"
    echo ""
    echo "  Available scripts:"
    echo "    ./api-tests/test.sh              - Test endpoint"
    echo "    ./api-tests/create-game.sh       - Create a game"
    echo "    ./api-tests/get-game.sh <id>     - Get game details"
    echo "    ./api-tests/join-game.sh <id>    - Join a game"
    echo "    ./api-tests/create-and-join-game.sh - Create then join (chained workflow)"
    echo ""
    
    echo ""
else
    echo -e "${RED}⚠ Warning: ID_TOKEN not available, skipping .env file creation${NC}"
    echo ""
fi

if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
    echo -e "${YELLOW}Refresh Token (save for later):${NC}"
    echo "  $REFRESH_TOKEN"
    echo ""
fi

echo -e "${GREEN}You can now test the API endpoints!${NC}"

