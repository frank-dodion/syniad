#!/bin/bash
# Script to create a test user and get authentication token for API testing

set -e

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

# Try to get from Terraform outputs
if [ -f "terraform/terraform.tfstate" ] || [ -f "terraform/.terraform/terraform.tfstate.d/dev/terraform.tfstate" ]; then
    echo "Attempting to get configuration from Terraform..."
    cd terraform 2>/dev/null || true
    
    USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
    CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")
    REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "")
    API_URL=$(terraform output -raw api_url 2>/dev/null || echo "")
    
    cd .. 2>/dev/null || true
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
read -p "Enter username for test user (default: testuser): " USERNAME
USERNAME=${USERNAME:-testuser}

read -p "Enter email for test user (default: test@example.com): " EMAIL
EMAIL=${EMAIL:-test@example.com}

read -sp "Enter password (min 8 chars, uppercase, lowercase, number): " PASSWORD
echo ""

# Validate password
if [ ${#PASSWORD} -lt 8 ]; then
    echo -e "${RED}Error: Password must be at least 8 characters${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Creating user...${NC}"

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$REGION" > /dev/null 2>&1 || {
    echo -e "${YELLOW}User might already exist, attempting to set password...${NC}"
}

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --password "$PASSWORD" \
  --permanent \
  --region "$REGION" > /dev/null 2>&1 || {
    echo -e "${RED}Error: Failed to set password. User might need to be confirmed.${NC}"
    exit 1
}

echo -e "${GREEN}✓ User created/updated${NC}"

echo ""
echo -e "${YELLOW}Authenticating...${NC}"

# Authenticate and get tokens
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME="$USERNAME",PASSWORD="$PASSWORD" \
  --region "$REGION" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Authentication failed${NC}"
    echo "$AUTH_RESPONSE"
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
echo -e "${YELLOW}ID Token (use this in Postman Authorization header):${NC}"
echo "$ID_TOKEN"
echo ""

if [ -n "$API_URL" ]; then
    echo -e "${YELLOW}API URL:${NC}"
    echo "$API_URL"
    echo ""
fi

echo -e "${YELLOW}Postman Configuration:${NC}"
echo "1. In Postman, create a new environment"
echo "2. Add variable 'id_token' with value:"
echo "   $ID_TOKEN"
echo ""
echo "3. For each request, add header:"
echo "   Key: Authorization"
echo "   Value: Bearer {{id_token}}"
echo ""
echo -e "${YELLOW}Or use Authorization tab:${NC}"
echo "- Type: Bearer Token"
echo "- Token: {{id_token}}"
echo ""

if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
    echo -e "${YELLOW}Refresh Token (save for later):${NC}"
    echo "$REFRESH_TOKEN"
    echo ""
fi

echo -e "${GREEN}You can now test the API endpoints!${NC}"

