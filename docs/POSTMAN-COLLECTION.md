# Postman Collection Setup

This guide helps you import a ready-to-use Postman collection for testing the Syniad API.

## Quick Start

### Step 1: Get Your Tokens

Run the helper script:
```bash
./scripts/test-cognito-auth.sh
```

This will:
- Create a test user (if needed)
- Authenticate and get tokens
- Display the ID token for use in Postman

### Step 2: Create Postman Environment

1. Open Postman
2. Click **Environments** → **+**
3. Name it "Syniad API"
4. Add these variables:

| Variable | Initial Value | Current Value | Type |
|----------|--------------|----------------|------|
| `id_token` | (paste from script output) | (auto-updated) | default |
| `api_url` | (get from `terraform output api_url`) | (auto-updated) | default |
| `game_id` | (leave empty) | (will be set after creating game) | default |

### Step 3: Create Requests

#### Request 1: Test Endpoint
- **Method**: GET
- **URL**: `{{api_url}}/test`
- **Authorization**: Bearer Token → `{{id_token}}`

#### Request 2: Create Game
- **Method**: POST
- **URL**: `{{api_url}}/games`
- **Authorization**: Bearer Token → `{{id_token}}`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "playerName": "Test Player"
}
```
- **Tests** (optional - auto-save game_id):
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("game_id", jsonData.gameId);
}
```

#### Request 3: Get Game
- **Method**: GET
- **URL**: `{{api_url}}/games/{{game_id}}`
- **Authorization**: Bearer Token → `{{id_token}}`

#### Request 4: Join Game
- **Method**: POST
- **URL**: `{{api_url}}/games/{{game_id}}/join`
- **Authorization**: Bearer Token → `{{id_token}}`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "playerName": "Second Player"
}
```

## Testing with Multiple Users

To test the join game functionality:

1. **Create User 1** using the script → Get token 1
2. **Create User 2** using the script → Get token 2
3. Create environment **"Syniad User 1"** with token 1
4. Create environment **"Syniad User 2"** with token 2
5. Create game with User 1
6. Copy the `game_id` from response
7. Switch to User 2 environment
8. Update `game_id` variable
9. Join game with User 2

## Token Expiration

Cognito ID tokens expire after 24 hours. When you get a 401 Unauthorized:

1. Run the script again to get a new token
2. Update `id_token` in your Postman environment

## Alternative: Use AWS CLI Directly

If you prefer using AWS CLI:

```bash
# Set variables
export USER_POOL_ID="your-pool-id"
export CLIENT_ID="your-client-id"
export REGION="us-east-1"
export USERNAME="testuser"
export PASSWORD="YourPass123!"

# Create user (one-time)
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $USERNAME \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region $REGION

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $USERNAME \
  --password $PASSWORD \
  --permanent \
  --region $REGION

# Get token
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=$USERNAME,PASSWORD=$PASSWORD \
  --region $REGION | jq -r '.AuthenticationResult.IdToken'
```

Copy the output token and use it in Postman.

