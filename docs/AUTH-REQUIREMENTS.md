# Authentication Requirements

## CRITICAL: User ID Must Always Be Cognito `sub`

**REQUIREMENT**: The application MUST use Cognito `sub` (from the ID token's `sub` claim) as the user identifier everywhere. Never use Better Auth's internal `session.user.id`.

### Why?
- Cognito `sub` is immutable and consistent across sessions
- Better Auth's internal ID can change or differ between environments
- Database records (games, scenarios) are stored with Cognito `sub`
- Using different IDs causes data mismatch and authentication failures

### Implementation

#### Server-Side (`lib/api-auth.ts`)
- ✅ Always extracts `sub` from Cognito ID token
- ✅ Returns `null` if `sub` cannot be extracted (forces re-authentication)
- ✅ Never falls back to `session.user.id`

#### Client-Side (`lib/auth-client.ts`)
- ✅ Fetches ID token from `/api/docs/session-token`
- ✅ Decodes `sub` from ID token
- ✅ Uses `sub` as `userId` in all API calls
- ✅ Never uses `session.user.id`

#### Database Storage
- ✅ All `userId` fields store Cognito `sub`
- ✅ `player1Id`, `player2Id`, `creatorId` all use Cognito `sub`
- ✅ Queries filter by Cognito `sub`

### If You See This Error
If you see authentication errors or "user not found" errors:
1. Check that ID token is being stored in session (Better Auth callbacks)
2. Verify `sub` is being extracted correctly
3. Never add fallbacks to `session.user.id` - fix the root cause instead

