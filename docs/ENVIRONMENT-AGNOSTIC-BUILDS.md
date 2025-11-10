# Environment-Agnostic Docker Builds

## Principle

**The Docker image must be identical across all environments (local, dev, prod). Only runtime environment variables differ.**

This ensures:
- Same image can be tested locally and deployed to any environment
- No rebuild needed when switching environments
- Consistent behavior across environments
- Easier debugging (same code in all environments)

## Implementation

### Client-Side Code (Browser)

All client-side code uses **runtime values** from the browser:

- **`window.location.origin`** - Always correct, no configuration needed
  - Used in: `lib/auth-client.ts`, `lib/scenario-api.ts`
  - No build-time embedding required

### Server-Side Code (Lambda/Node.js)

All server-side code reads from **runtime environment variables**:

- `FRONTEND_URL` - Set in Lambda environment variables
- `COGNITO_*` - Set in Lambda environment variables  
- `GAMES_TABLE`, `SCENARIOS_TABLE`, etc. - Set in Lambda environment variables
- `AWS_REGION` - Automatically provided by Lambda

### Build-Time Configuration

**No build-time environment variables are used.**

The Dockerfile does not accept any `ARG` values for environment-specific config:
- No `NEXT_PUBLIC_FRONTEND_URL` build arg
- No `NEXT_PUBLIC_API_URL` build arg
- No environment-specific build args

### Static Assets

`NEXT_PUBLIC_ASSET_PREFIX` is left **empty** at build time:
- Next.js generates relative paths: `/_next/static/...`
- CloudFront routes `/_next/static/*` to S3 automatically
- No environment-specific build needed

### Docker Build Process

```bash
# Build command (same for all environments)
docker buildx build --platform linux/amd64 -f Dockerfile -t image:tag .

# No --build-arg flags needed
# Image is identical for local, dev, and prod
```

### Runtime Configuration

Environment-specific values are set in Lambda environment variables:

```hcl
# terraform/nextjs-lambda.tf
environment {
  variables = {
    FRONTEND_URL = "https://${local.frontend_domain_name}"
    COGNITO_CLIENT_ID = "..."
    GAMES_TABLE = "..."
    # etc.
  }
}
```

### Verification

To verify the image is environment-agnostic:

1. **Build once:**
   ```bash
   docker build -t test-image .
   ```

2. **Run with different env vars:**
   ```bash
   # Dev
   docker run -e FRONTEND_URL=https://dev.syniad.net test-image
   
   # Prod  
   docker run -e FRONTEND_URL=https://syniad.net test-image
   ```

3. **Same image, different behavior based on env vars**

## Files Modified

- ✅ `Dockerfile` - Removed all build-time ARGs
- ✅ `scripts/build-and-push-nextjs-docker.sh` - No build args passed
- ✅ `lib/auth-client.ts` - Uses `window.location.origin`
- ✅ `lib/scenario-api.ts` - Uses `window.location.origin`
- ✅ `lib/auth.ts` - Reads from runtime `FRONTEND_URL`
- ✅ `next.config.js` - Removed hardcoded env defaults

## Benefits

1. **Single Docker image for all environments**
2. **Faster deployments** - No rebuild needed
3. **Easier testing** - Test same image locally
4. **Consistent behavior** - Same code everywhere
5. **Simpler CI/CD** - Build once, deploy anywhere

