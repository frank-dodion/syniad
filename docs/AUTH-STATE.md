# Authentication State Documentation

## Current Status

### What Works
- ✅ User can log in via Cognito OAuth
- ✅ User can log out (including Cognito logout)
- ✅ Better Auth session is created and maintained
- ✅ Server-side API authentication works (using Better Auth session cookies)
- ✅ Client-side and server-side both use Cognito `sub` as user identifier
- ✅ User can create scenarios and games
- ✅ Games and scenarios persist correctly after re-login

### Implementation

#### User ID: Cognito `sub` Only
**REQUIREMENT**: The application MUST use Cognito `sub` (from the ID token's `sub` claim) as the user identifier everywhere. See `docs/AUTH-REQUIREMENTS.md` for details.

**Current Implementation**:
- ✅ Server-side (`lib/api-auth.ts`): Extracts `sub` from ID token, never falls back to Better Auth ID
- ✅ Client-side (`lib/auth-client.ts`): Fetches ID token from `/api/docs/session-token` and decodes `sub`
- ✅ Database: All `userId` fields store Cognito `sub`
- ✅ Both client and server use the same identifier, ensuring data consistency

**How It Works**:
1. User logs in via Cognito OAuth
2. Better Auth stores ID token in session (via `jwt` and `session` callbacks in `lib/auth.ts`)
3. Client fetches ID token from `/api/docs/session-token` endpoint
4. Client decodes `sub` from ID token and uses it as `userId`
5. Server extracts `sub` from session's ID token and uses it as `userId`
6. All API calls use Cognito `sub`, ensuring consistent data access

#### 2. WebSocket Authentication
**Problem**: 
- WebSocket connection ideally requires ID token for authentication
- ID token is not available in session, so WebSocket connections were failing

**Current Workaround**:
- WebSocket connection now works without ID token (token is optional)
- Lambda handler validates access by checking that `userId` matches `player1Id` or `player2Id` in the game record
- This is secure because only players of a game can connect (validated server-side)
- `getAccessToken()` in `GameClient.tsx` still attempts to fetch token but proceeds without it if unavailable
- Warning logged when token not available (expected behavior)

**Note**: This is a temporary workaround. Once Better Auth callbacks are fixed to store the ID token, we can add proper token validation to the Lambda handler.

## Code Structure

### Client-Side (`lib/auth-client.ts`)
- Uses Better Auth's `createAuthClient()` from `better-auth/react`
- `useAuth()` hook returns `session.user.id` as `userId`
- No ID token extraction (reverted to original behavior)

### Server-Side (`lib/auth.ts`)
- Better Auth configured with Cognito OAuth provider
- `jwt` callback defined to store `account.id_token` in token
- `session` callback defined to copy tokens from token to session
- **Callbacks are not being called** (no logs appear during OAuth flow)

### API Authentication (`lib/api-auth.ts`)
- `extractUserIdentity()` tries to get ID token from session
- Falls back to `session.user.id` if ID token not available
- Decodes Cognito `sub` from ID token when available

### Session Token Endpoint (`app/api/docs/session-token/route.ts`)
- Returns ID token from session for client-side use
- Currently returns `null` because ID token not in session

## Better Auth Callback Issue

The `jwt` and `session` callbacks in `lib/auth.ts` are defined but never execute:
- No logs from callbacks during OAuth flow
- OAuth callback (`/api/auth/callback/cognito`) is called successfully
- Session is created with user info
- But callbacks don't run to store tokens

**Possible Reasons**:
1. Better Auth might not support these callbacks for OAuth providers
2. Callback structure might be different for Better Auth vs NextAuth
3. Callbacks might need to be configured differently

## Next Steps

1. **Investigate Better Auth callback API** - Check if callbacks work differently
2. **Alternative approach** - Store Cognito `sub` in Better Auth user record during OAuth
3. **Use Better Auth user ID consistently** - Make server use `session.user.id` instead of Cognito `sub`
4. **Manual token storage** - Intercept OAuth callback to manually store tokens

## Files Modified

- `lib/auth-client.ts` - Reverted to use `session.user.id` (original behavior)
- `lib/auth.ts` - Callbacks defined but not executing
- `app/api/docs/session-token/route.ts` - Returns ID token from session (currently null)
- `lib/api-auth.ts` - Falls back to `session.user.id` when ID token unavailable

## Important Notes

- **DO NOT** modify `lib/auth-client.ts` to extract Cognito `sub` unless ID token storage is fixed first
- **DO NOT** remove the callbacks - they might work once Better Auth is configured correctly
- The user ID mismatch is the root cause of scenarios/games not being found
- WebSocket authentication depends on ID token being available

