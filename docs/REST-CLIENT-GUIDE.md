# API Testing Guide - REST Client

This guide helps you test the Syniad API using the REST Client extension in Cursor or VS Code.

## REST Client Extension (Recommended)

The REST Client extension is the best choice for testing in Cursor/VS Code - it's simple, file-based, and works perfectly.

### Step 1: Install Extension

1. Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux) to open Extensions
2. Search for **"REST Client"** by Huachao Mao
3. Click **Install**

### Step 2: Get Your API Credentials

Run the helper script to create a test user and get your authentication token:

```bash
./scripts/test-cognito-auth.sh
```

The script will:
- Create/update a test user in Cognito
- Get an authentication token
- Automatically populate your `.env` file with the token and API URL

### Step 3: Use the Request Files

The project includes separate `.http` files for each endpoint in the `api-tests/` folder. The `test-cognito-auth.sh` script will:
- Automatically populate your `.env` file with the token and API URL
- All REST Client `.http` files read variables from the shared `.env` file

**Available files:**
- `api-tests/test.http` - Test endpoint
- `api-tests/create-game.http` - Create a new game (extracts gameId for chaining)
- `api-tests/get-game.http` - Get game details (can use chained gameId)
- `api-tests/join-game.http` - Join an existing game (can use chained gameId)
- `api-tests/create-and-join-game.http` - **Chained workflow** (create then join automatically)

**Security:** 
- `.env` file is **gitignored** (contains tokens) - never commit it!
- All `.http` files are **safe to commit** (use `{{$dotenv VAR}}` syntax, no tokens stored)

**How it works:**
1. All files use `{{$dotenv API_URL}}`, `{{$dotenv ID_TOKEN}}`, etc.
2. REST Client automatically reads these from your `.env` file
3. All `.http` files share the same `.env` variables
4. Just open any `.http` file and click "Send Request"

**Important - Variable Persistence:**
- The `.env` file is updated every time you run `test-cognito-auth.sh`
- REST Client caches environment variables - if changes aren't picked up:
  - **Reload Window**: Press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux), then type "Reload Window"
  - **Or** close and reopen the `.http` file
  - **Or** restart VS Code/Cursor
- The `.env` file persists between sessions, so your tokens remain available

**Variables in .env:**
- `API_URL`: Your API endpoint (automatically updated by the script)
- `ID_TOKEN`: Your JWT token (automatically updated by the script)
- `GAME_ID`: Update this in `.env` with a game ID after creating a game

**Send requests:**
1. Click **"Send Request"** that appears above each request section
2. Or hover over a request and press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows/Linux)
3. The response will appear in a new tab next to the request file

### Step 4: Test Your API

1. **Test Endpoint** - Use `api-tests/test.http` to verify authentication works
2. **Create Game** - Use `api-tests/create-game.http` to create a game, copy the `gameId` from the response
3. **Update `GAME_ID` in `.env`** - Replace `paste-game-id-here` with the actual game ID in `.env`
4. **Get Game** - Use `api-tests/get-game.http` to retrieve game details
5. **Join Game** - Use `api-tests/join-game.http` to add a second player (use a different user's token)

### Request File Structure

Each `.http` file uses this format:

```http
### Test Endpoint
GET {{$dotenv API_URL}}/test
Authorization: Bearer {{$dotenv ID_TOKEN}}
```

All files automatically read from your `.env` file using the `{{$dotenv VARIABLE_NAME}}` syntax.

**Key points:**
- All variables are stored in `.env` (gitignored)
- Variables are used in requests with `{{$dotenv VARIABLE_NAME}}`
- The token must remain on one line (no line breaks) - visual wrapping in editor is OK
- All `.http` files share the same `.env` variables
- Each request section is separated by `###`

### Chaining Requests

REST Client supports chaining requests by extracting values from responses. For example:

1. **Run `create-game.http`** - Creates a game and automatically extracts the `gameId` from the response
2. **Then run `get-game.http` or `join-game.http`** - They automatically use the `gameId` from step 1

The `create-game.http` file includes a response script that extracts `gameId` and stores it globally:

```http
> {%
    if (response.status === 200) {
        const responseBody = JSON.parse(response.body);
        const gameId = responseBody.gameId || responseBody.game?.gameId;
        if (gameId) {
            client.global.set("gameId", gameId);
        }
    }
%}
```

Subsequent requests can then use `{{gameId}}` instead of `{{$dotenv GAME_ID}}`.

**Example workflow:**
- Use `create-and-join-game.http` - This file chains both requests automatically
- Or manually: Run `create-game.http`, then `join-game.http` (uses the stored `gameId`)

---

## Alternative REST Clients

### Bruno (Desktop App)

**Bruno** is a modern, open-source REST client that's completely free.

- ✅ Open source and completely free
- ✅ No sign-in required
- ✅ File-based collections (can be version controlled)
- ✅ Modern, clean interface

**Installation:** https://www.usebruno.com

### Hoppscotch (Web-Based)

Hoppscotch is a web-based REST client - no installation needed.

1. Go to: https://hoppscotch.io
2. Run `./scripts/test-cognito-auth.sh` to get credentials
3. Create an environment with `api_url` and `id_token` variables
4. Create requests using the environment variables

---

## Testing with Multiple Users

To test multiplayer functionality:

1. **Create User 1**:
   ```bash
   ./scripts/test-cognito-auth.sh
   ```
   Use email: `player1@example.com`

2. **Create Game** with User 1's token

3. **Create User 2** (run script again):
   ```bash
   ./scripts/test-cognito-auth.sh
   ```
   Use email: `player2@example.com`
   
   Update `ID_TOKEN` in `.env` file with User 2's token

4. **Join Game** with User 2's token (same `GAME_ID` in `.env`)

---

## Token Expiration

Cognito ID tokens expire after 24 hours. When you get a `401 Unauthorized`:

1. Run the script again:
   ```bash
   ./scripts/test-cognito-auth.sh
   ```

2. The script automatically updates `.env` with the new token

---

## Troubleshooting

**Getting 401 Unauthorized?**
- Token may have expired - run `./scripts/test-cognito-auth.sh` to get a new token
- Make sure the `Authorization: Bearer {{id_token}}` header is present

**Getting 403 Forbidden?**
- Token might be invalid - get a fresh token
- Check that the route is properly configured

**REST Client variables not working?**
- Make sure you're using `{{variable_name}}` syntax (with double braces)
- Variables must be defined at the top of the file with `@variable_name = value`
- No spaces around the `=` sign

**Can't edit `@game_id` variable?**
- Make sure the value isn't set to something that looks like a variable name
- Use a placeholder like `paste-game-id-here` that you can easily replace

**CORS errors?**
- Check that your `cors_allowed_origins` in Terraform includes your origin
- For local testing, ensure `http://localhost:*` is included

---

## Command Line Alternatives

### Using curl

```bash
# Load credentials
source .cognito-test.env

# Test endpoint
curl -H "Authorization: Bearer $ID_TOKEN" "$API_URL/test"

# Create game
curl -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Test Player"}' \
  "$API_URL/games"
```

### Using HTTPie (Better than curl)

```bash
# Install: brew install httpie
# Load credentials
source .cognito-test.env

# Much cleaner syntax!
http GET "$API_URL/test" "Authorization:Bearer $ID_TOKEN"
http POST "$API_URL/games" \
  "Authorization:Bearer $ID_TOKEN" \
  playerName="Test Player"
```

