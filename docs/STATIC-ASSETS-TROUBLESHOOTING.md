# Static Assets Troubleshooting Guide

## Issue: 403 Forbidden errors when loading static chunks

### Symptoms
- Browser console shows: `GET https://syniad.net/_next/static/chunks/XXX.js net::ERR_ABORTED 403 (Forbidden)`
- Static assets are deployed to S3
- CloudFront distribution is configured
- S3 bucket policy allows CloudFront access

### Root Causes

1. **Build ID Mismatch**: Next.js generates chunk names based on build ID. If the Docker image was built with a different build ID than what's in S3, the browser will request chunks that don't exist.

2. **CloudFront OAC Permissions**: The Origin Access Control (OAC) might not be properly configured, causing CloudFront to get 403 when accessing S3.

3. **CloudFront Cache**: Old cached 403 responses might be served even after fixing the issue.

### Solutions

#### 1. Deploy Static Assets from Docker Image

The static assets in S3 must match the build in the Docker image:

```bash
cd terraform
terraform workspace select prod
cd ..
bash scripts/deploy-static-assets.sh prod
```

This script will:
- Extract static assets from the production Docker image
- Upload them to S3 with `--delete` flag to remove old builds
- Ensure S3 has the exact same files as the Docker image

#### 2. Verify S3 Bucket Policy

Verify the S3 bucket policy allows CloudFront:

```bash
cd terraform
terraform workspace select prod
BUCKET=$(terraform output -raw game_static_bucket_name)
aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text | jq .
```

The policy should allow `cloudfront.amazonaws.com` service principal with the CloudFront distribution ARN.

#### 3. Verify CloudFront Configuration

Check that CloudFront has:
- S3 origin configured with OAC
- Cache behavior for `/_next/static/*` pointing to S3 origin
- Correct origin access control ID

```bash
cd terraform
terraform workspace select prod
DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
aws cloudfront get-distribution-config --id "$DIST_ID" | jq '.DistributionConfig.Origins'
```

#### 4. Invalidate CloudFront Cache

After deploying static assets, invalidate the CloudFront cache:

```bash
cd terraform
terraform workspace select prod
DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/_next/static/*"
```

#### 5. Verify Static Assets

Use the verification script:

```bash
bash scripts/verify-static-assets.sh prod
```

This will check:
- S3 bucket exists and has files
- S3 bucket policy is correct
- CloudFront distribution is configured
- Static assets are accessible via CloudFront

### Prevention

1. **Always deploy static assets after building Docker image**: The Terraform `null_resource.deploy_static_assets` should run automatically, but verify it completes successfully.

2. **Use `--delete` flag**: When syncing to S3, use `--delete` to remove old build IDs that might cause confusion.

3. **Match build IDs**: Ensure the Docker image and S3 static assets are from the same build. The deploy script extracts from the Docker image to ensure this.

### Current Status

- ✅ S3 bucket exists and has static assets
- ✅ S3 bucket policy allows CloudFront
- ✅ CloudFront has S3 origin configured
- ✅ CloudFront has cache behavior for `/_next/static/*`
- ⚠️  Still getting 403 - may need CloudFront cache invalidation or OAC reconfiguration

### Next Steps

1. Invalidate CloudFront cache (see step 4 above)
2. Wait 5-10 minutes for CloudFront propagation
3. Test again in browser
4. If still failing, check CloudFront logs or S3 access logs

