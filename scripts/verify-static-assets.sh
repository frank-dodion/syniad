#!/bin/bash

# Verify static assets deployment and CloudFront configuration
# Usage: ./scripts/verify-static-assets.sh [stage]
# stage: dev or prod (default: dev)

set -e

STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "Verifying Static Assets for: $STAGE"
echo "=========================================="

# Get bucket name from Terraform output
cd "$PROJECT_ROOT/terraform"
if [ "$STAGE" = "dev" ]; then
    terraform workspace select dev 2>/dev/null || true
elif [ "$STAGE" = "prod" ]; then
    terraform workspace select prod 2>/dev/null || true
fi

BUCKET_GAME=$(terraform output -raw game_static_bucket_name 2>/dev/null || echo "")
CLOUDFRONT_DIST_ID=$(terraform output -raw frontend_cloudfront_distribution_id 2>/dev/null || echo "")
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "")

if [ -z "$BUCKET_GAME" ]; then
  echo "❌ Error: Could not get bucket name from Terraform. Make sure Terraform has been applied."
  exit 1
fi

echo ""
echo "1. Checking S3 Bucket: $BUCKET_GAME"
echo "-----------------------------------"

# Check if bucket exists
if aws s3 ls "s3://$BUCKET_GAME" >/dev/null 2>&1; then
  echo "✅ S3 bucket exists"
else
  echo "❌ S3 bucket does not exist or is not accessible"
  exit 1
fi

# Count files in _next/static
STATIC_COUNT=$(aws s3 ls "s3://$BUCKET_GAME/_next/static/" --recursive 2>/dev/null | wc -l | tr -d ' ')
if [ "$STATIC_COUNT" -gt 0 ]; then
  echo "✅ Found $STATIC_COUNT static asset files in S3"
  echo ""
  echo "Sample files:"
  aws s3 ls "s3://$BUCKET_GAME/_next/static/" --recursive | head -5
else
  echo "❌ No static assets found in S3 bucket"
  echo "   Run: bash scripts/deploy-static-assets.sh $STAGE"
  exit 1
fi

echo ""
echo "2. Checking S3 Bucket Policy"
echo "-----------------------------------"
BUCKET_POLICY=$(aws s3api get-bucket-policy --bucket "$BUCKET_GAME" --query Policy --output text 2>/dev/null || echo "")
if [ -n "$BUCKET_POLICY" ]; then
  echo "✅ S3 bucket policy exists"
  # Check if it allows CloudFront
  if echo "$BUCKET_POLICY" | grep -q "cloudfront.amazonaws.com"; then
    echo "✅ Bucket policy allows CloudFront access"
  else
    echo "⚠️  Bucket policy exists but may not allow CloudFront"
  fi
else
  echo "❌ No bucket policy found"
fi

if [ -n "$CLOUDFRONT_DIST_ID" ]; then
  echo ""
  echo "3. Checking CloudFront Distribution"
echo "-----------------------------------"
  DIST_STATUS=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DIST_ID" --query 'Distribution.Status' --output text 2>/dev/null || echo "")
  if [ "$DIST_STATUS" = "Deployed" ]; then
    echo "✅ CloudFront distribution is deployed"
    
    # Get distribution config
    DIST_CONFIG=$(aws cloudfront get-distribution-config --id "$CLOUDFRONT_DIST_ID" 2>/dev/null || echo "")
    if echo "$DIST_CONFIG" | grep -q "s3-static"; then
      echo "✅ CloudFront has S3 static origin configured"
    else
      echo "⚠️  CloudFront may not have S3 static origin configured"
    fi
    
    # Check cache behaviors
    if echo "$DIST_CONFIG" | grep -q "_next/static"; then
      echo "✅ CloudFront has cache behavior for /_next/static/*"
    else
      echo "⚠️  CloudFront may not have cache behavior for /_next/static/*"
    fi
  else
    echo "⚠️  CloudFront distribution status: $DIST_STATUS"
  fi
else
  echo ""
  echo "3. CloudFront Distribution"
  echo "-----------------------------------"
  echo "⚠️  Could not get CloudFront distribution ID"
fi

echo ""
echo "4. Testing Static Asset URL"
echo "-----------------------------------"
if [ -n "$FRONTEND_URL" ]; then
  TEST_URL="${FRONTEND_URL}/_next/static/chunks/main.js"
  echo "Testing: $TEST_URL"
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Static asset is accessible via CloudFront"
  elif [ "$HTTP_CODE" = "403" ]; then
    echo "❌ Got 403 Forbidden - check S3 bucket policy and CloudFront OAC"
  elif [ "$HTTP_CODE" = "404" ]; then
    echo "❌ Got 404 Not Found - static assets may not be deployed"
  else
    echo "⚠️  Got HTTP $HTTP_CODE - may need to wait for CloudFront propagation"
  fi
else
  echo "⚠️  Could not determine frontend URL"
fi

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="

