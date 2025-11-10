# Authentication Troubleshooting Guide

## Dev Environment: Better Auth "Unknown" Error

### Symptoms
- User sees "Better Auth Error - Unknown" after clicking login
- OAuth flow redirects to Cognito but fails on callback

### Root Causes
1. **OAuth Callback URL Mismatch**: The callback URL in Better Auth doesn't match Cognito configuration
2. **Token Exchange Failure**: Cognito returns tokens but Better Auth fails to process them
3. **Environment Variable Mismatch**: `NEXT_PUBLIC_FRONTEND_URL` doesn't match actual domain

### Debugging Steps

1. **Check Lambda Logs** (CloudWatch):
   ```bash
   aws logs tail /aws/lambda/syniad-dev-game --follow
   ```
   Look for `[Better Auth]` log entries to see the actual error

2. **Verify Cognito Callback URLs**:
   ```bash
   cd terraform
   terraform workspace select dev
   aws cognito-idp describe-user-pool-client \
     --user-pool-id $(terraform output -raw cognito_user_pool_id) \
     --client-id $(terraform output -raw cognito_user_pool_client_id) \
     --query 'UserPoolClient.CallbackURLs'
   ```
   Should include: `https://dev.syniad.net/api/auth/callback/cognito`

3. **Check Environment Variables**:
   - `NEXT_PUBLIC_FRONTEND_URL` should be `https://dev.syniad.net`
   - `COGNITO_DOMAIN` should match Terraform output
   - `COGNITO_CLIENT_ID` should match Terraform output

4. **Test OAuth Flow Manually**:
   - Visit: `https://dev.syniad.net/api/auth/signin/cognito`
   - Check browser network tab for redirects
   - Check Lambda logs for errors

### Solutions

1. **Improved Error Logging**: Added better error handling in `app/api/auth/[...all]/route.ts` to log actual error details
2. **Debug Logging**: Changed Better Auth logger level to `debug` in dev environment
3. **Verify Configuration**: Ensure all environment variables match Terraform outputs

## Prod Environment: Missing Static Chunks (403 Errors)

### Symptoms
- Browser console shows: `GET https://syniad.net/_next/static/chunks/XXX.js net::ERR_ABORTED 403`
- Specific chunks like `8df6918963c509f4.js` don't exist in S3

### Root Cause
**Build ID Mismatch**: The Docker image running in Lambda has different chunk names (build IDs) than what's deployed to S3. This happens when:
- Docker image is rebuilt but static assets aren't redeployed
- Static assets are deployed from a different build than the Docker image
- Build process generates new chunk hashes

### Solution

**Rebuild and Redeploy Everything**:

1. **Rebuild Docker Image**:
   ```bash
   cd terraform
   terraform workspace select prod
   cd ..
   bash scripts/build-and-push-nextjs-docker.sh prod
   ```

2. **Deploy Static Assets from New Docker Image**:
   ```bash
   bash scripts/deploy-static-assets.sh prod
   ```
   This extracts static assets from the newly built Docker image and uploads to S3.

3. **Invalidate CloudFront Cache**:
   ```bash
   cd terraform
   DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
   aws cloudfront create-invalidation \
     --distribution-id "$DIST_ID" \
     --paths "/_next/static/*"
   ```

4. **Update Lambda** (if needed):
   ```bash
   cd terraform
   terraform apply
   ```
   This will update Lambda with the new Docker image.

### Prevention

1. **Always Deploy Static Assets After Building**: The Terraform `null_resource.deploy_static_assets` should run automatically, but verify it completes.

2. **Use Same Build for Both**: Ensure static assets are extracted from the same Docker image that's deployed to Lambda.

3. **Check Build IDs Match**: After deployment, verify chunk names in S3 match what the app is requesting.

### Verification

```bash
# Check what chunks are in S3
cd terraform
terraform workspace select prod
BUCKET=$(terraform output -raw game_static_bucket_name)
aws s3 ls "s3://$BUCKET/_next/static/chunks/" | head -10

# Check what chunks the app is requesting (browser console)
# They should match!
```

## Common Issues

### Issue: "redirect_mismatch" Error
**Solution**: Ensure `NEXT_PUBLIC_FRONTEND_URL` matches the domain and Cognito callback URLs are configured correctly.

### Issue: Static Assets 403
**Solution**: Rebuild Docker image and redeploy static assets, then invalidate CloudFront cache.

### Issue: Better Auth "Unknown" Error
**Solution**: Check Lambda logs for actual error details (now logged with improved error handling).

