# API Testing Guide

This guide explains how to test the Syniad API using REST clients like Postman before building the UI.

## Prerequisites

1. **AWS CLI** installed and configured with credentials
2. **Postman** (or similar REST client)
3. **Cognito User Pool** deployed (get values from Terraform outputs)

## Step 1: Get Cognito Configuration

After deploying, get the Cognito configuration:

```bash
cd terraform
terraform output cognito_user_pool_id
terraform output cognito_user_pool_client_id
terraform output cognito_region
terraform output api_url
```

## Step 2: Create a Test User

### Option A: Using AWS CLI (Recommended)

```bash
# Set variables
USER_POOL_ID="<your-user-pool-id>"
REGION="<your-region>"
USERNAME="testuser"
EMAIL="test@example.com"
PASSWORD="TestPass123!"

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $USERNAME \
  --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region $REGION

# Set permanent password (skip temporary password)
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $USERNAME \
  --password $PASSWORD \
  --permanent \
  --region $REGION
```

### Option B: Using the Test Script

See `scripts/test-cognito-auth.sh` for an automated script.

## Step 3: Get Authentication Token

### Using AWS CLI

```bash
# Authenticate and get tokens
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=$USERNAME,PASSWORD=$PASSWORD \
  --region $REGION
```

This returns:
```json
{
  "AuthenticationResult": {
    "IdToken": "eyJraWQiOiJ...",
    "AccessToken": "eyJraWQiOiJ...",
    "RefreshToken": "eyJjdHki..."
  }
}
```

**Copy the `IdToken` value** - this is what you'll use in Postman.

### Using Postman's OAuth 2.0

1. Create a new request in Postman
2. Go to **Authorization** tab
3. Select **OAuth 2.0**
4. Configure:
   - **Grant Type**: Authorization Code
   - **Auth URL**: `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/authorize`
   - **Access Token URL**: `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/token`
   - **Client ID**: Your Cognito Client ID
   - **Client Secret**: (leave blank - we set `generate_secret = false`)
   - **Scope**: `openid email profile`
   - **State**: (leave blank)
5. Click **Get New Access Token**
6. Use the **ID Token** (not Access Token) in API requests

## Step 4: Configure Postman

### Set Environment Variables

Create a Postman environment with:
- `id_token`: Your Cognito ID token
- `api_url`: Your API Gateway URL (from Terraform output)
- `game_id`: (will be set after creating a game)

### Set Authorization Header

For each request:
1. Go to **Headers** tab
2. Add header:
   - **Key**: `Authorization`
   - **Value**: `Bearer {{id_token}}`

Or use **Authorization** tab:
1. Select **Bearer Token**
2. Token: `{{id_token}}`

## Step 5: Test API Endpoints

### 1. Test Endpoint (GET)

**Request:**
```
GET {{api_url}}/test
```

**Headers:**
```
Authorization: Bearer {{id_token}}
```

**Expected Response:**
```json
{
  "message": "Hello from TypeScript!",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "event": {
    "path": "/test",
    "httpMethod": "GET"
  },
  "user": {
    "userId": "cognito-user-id",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

### 2. Create Game (POST)

**Request:**
```
POST {{api_url}}/games
```

**Headers:**
```
Authorization: Bearer {{id_token}}
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "playerName": "Test Player"
}
```

**Expected Response:**
```json
{
  "gameId": "123e4567-e89b-12d3-a456-426614174000",
  "game": {
    "gameId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "waiting",
    "players": [
      {
        "name": "Test Player",
        "userId": "cognito-user-id",
        "playerIndex": 0
      }
    ],
    "turnNumber": 1,
    "createdAt": "2024-01-01T12:00:00.000Z"
  },
  "user": {
    "userId": "cognito-user-id",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

**Save `gameId` to your environment variable `{{game_id}}`**

### 3. Get Game (GET)

**Request:**
```
GET {{api_url}}/games/{{game_id}}
```

**Headers:**
```
Authorization: Bearer {{id_token}}
```

**Expected Response:**
```json
{
  "gameId": "123e4567-e89b-12d3-a456-426614174000",
  "game": {
    "gameId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "waiting",
    "players": [...],
    "turnNumber": 1,
    "createdAt": "2024-01-01T12:00:00.000Z"
  },
  "user": {
    "userId": "cognito-user-id",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

### 4. Join Game (POST)

**Request:**
```
POST {{api_url}}/games/{{game_id}}/join
```

**Headers:**
```
Authorization: Bearer {{id_token}}
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "playerName": "Second Player"
}
```

**Expected Response:**
```json
{
  "gameId": "123e4567-e89b-12d3-a456-426614174000",
  "game": {
    "gameId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "active",
    "players": [
      {
        "name": "Test Player",
        "userId": "creator-user-id",
        "playerIndex": 0
      },
      {
        "name": "Second Player",
        "userId": "joiner-user-id",
        "playerIndex": 1
      }
    ],
    "turnNumber": 1,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:01:00.000Z"
  },
  "message": "Game is now active!",
  "user": {
    "userId": "joiner-user-id",
    "username": "testuser2",
    "email": "test2@example.com"
  }
}
```

## Token Refresh

Cognito ID tokens expire after 24 hours (as configured). To refresh:

```bash
# Use the refresh token from the initial authentication
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters REFRESH_TOKEN=$REFRESH_TOKEN \
  --region $REGION
```

## Troubleshooting

### 401 Unauthorized
- Token expired → Get a new token
- Invalid token → Check you're using ID Token, not Access Token
- Missing header → Ensure `Authorization: Bearer <token>` header is present

### 403 Forbidden
- Token not valid → Verify token with Cognito
- User not confirmed → Confirm user in Cognito console or CLI

### CORS Errors
- Check `cors_allowed_origins` in Terraform
- For local testing, ensure `http://localhost:*` is included

