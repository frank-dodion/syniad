# Troubleshooting 403 Errors with Lambda Function URL and CloudFront

If you're seeing `403 Forbidden` with `{"Message": null}` when accessing the API through CloudFront, follow these steps:

## Step 1: Verify Terraform Changes Are Applied

The CloudFront configuration must be updated to:
- Remove the 403 custom error response
- Add API-specific cache behavior with TTL=0
- Ensure Lambda permission exists

```bash
cd terraform
terraform workspace select dev
terraform plan  # Review changes
terraform apply # Apply changes
```

**Important**: CloudFront distribution updates take 15-20 minutes to propagate globally.

## Step 2: Test Lambda Function URL Directly

Test if the Lambda Function URL works when bypassing CloudFront:

```bash
# Get your token first (if testing authenticated endpoints)
./scripts/test-cognito-auth.sh

# Test the Lambda Function URL directly
./scripts/test-lambda-function-url.sh dev <your-token>
```

If the direct Lambda Function URL works but CloudFront doesn't, the issue is with CloudFront configuration.

## Step 3: Invalidate CloudFront Cache

CloudFront may be caching the 403 error:

```bash
npm run invalidate-cache:dev
# or
bash scripts/invalidate-cloudfront-cache.sh dev
```

Wait 1-2 minutes for the invalidation to complete.

## Step 4: Verify Lambda Permission

Check that the Lambda permission exists:

```bash
cd terraform
terraform state show aws_lambda_permission.game_function_url
```

It should show:
- `action = "lambda:InvokeFunctionUrl"`
- `principal = "*"`
- `function_url_auth_type = "NONE"`

## Step 5: Check CloudFront Distribution Status

Verify the distribution has finished updating:

```bash
cd terraform
DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
aws cloudfront get-distribution --id $DIST_ID --query 'Distribution.Status' --output text
```

Status should be `Deployed`. If it's `InProgress`, wait for it to complete.

## Step 6: Verify API Cache Behavior

Check that the API cache behavior has TTL=0:

```bash
cd terraform
DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
aws cloudfront get-distribution-config --id $DIST_ID --query 'DistributionConfig.CacheBehaviors.Items[?PathPattern==`/api/*`]' --output json
```

Should show:
- `MinTTL: 0`
- `DefaultTTL: 0`
- `MaxTTL: 0`

## Common Issues

### Issue: "AccessDeniedException" from Lambda
**Cause**: Lambda permission not applied or CloudFront not allowed
**Solution**: 
1. Apply Terraform changes
2. Wait for CloudFront to update
3. Invalidate cache

### Issue: 403 Cached by CloudFront
**Cause**: CloudFront cached the 403 error before fixes were applied
**Solution**: Invalidate CloudFront cache for `/api/*` paths

### Issue: Authorization Header Not Forwarded
**Cause**: CloudFront not forwarding headers correctly
**Solution**: Verify `headers = ["*"]` in cache behavior (already configured)

## Testing After Fixes

1. **Wait for CloudFront Update**: 15-20 minutes after `terraform apply`
2. **Invalidate Cache**: Run cache invalidation script
3. **Wait for Invalidation**: 1-2 minutes
4. **Test in Swagger UI**: Try the API request again

## Direct Lambda Function URL Testing

To test without CloudFront:

```bash
# Get Function URL
cd terraform
FUNCTION_URL=$(terraform output -raw game_lambda_function_url)

# Test with curl
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"Test"}' \
  "${FUNCTION_URL}api/scenarios"
```

If this works but CloudFront doesn't, the issue is definitely with CloudFront configuration or caching.

