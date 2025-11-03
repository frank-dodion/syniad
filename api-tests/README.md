# API Testing

This directory contains API integration tests and testing utilities.

## Testing Frameworks

### Jest (Recommended for CI/CD)

**Location:** `api-tests/__tests__/api.test.ts`

**Run tests:**
```bash
# Run all API tests
npm run test:api

# Run in watch mode (auto-reruns on file changes)
npm run test:api:watch

# Run all tests
npm test
```

**Benefits:**
- ✅ Structured test cases with assertions
- ✅ Proper error messages and test reporting
- ✅ CI/CD integration ready
- ✅ Test isolation and cleanup
- ✅ TypeScript support
- ✅ Can run in parallel

**Setup:**
1. Generate auth credentials: `./scripts/test-cognito-auth.sh`
2. Run tests: `npm run test:api`

### Bash Scripts (Quick Manual Testing)

**Location:** `api-tests/*.sh`

**Run scripts:**
```bash
./api-tests/test.sh
./api-tests/create-game.sh "Player Name"
./api-tests/get-game.sh <gameId>
./api-tests/join-game.sh <gameId> "Player Name"
```

**Benefits:**
- ✅ Quick manual testing
- ✅ Easy to read and modify
- ✅ Can use from terminal without npm
- ✅ Good for debugging

### REST Client (Interactive Testing)

**Location:** `api-tests/*.http`

**Use:**
- Open `.http` files in VS Code/Cursor
- Click "Send Request" button
- View responses inline

**Benefits:**
- ✅ Interactive testing
- ✅ Visual request/response
- ✅ No terminal needed
- ✅ Can chain requests

## Which Should I Use?

- **For Development/Quick Tests:** REST Client or Bash scripts
- **For CI/CD & Automated Testing:** Jest
- **For Manual Debugging:** Bash scripts

All methods use the same `.env` file for authentication.

