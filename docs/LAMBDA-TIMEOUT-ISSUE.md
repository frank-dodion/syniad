# Lambda Function Timeout Issue

## Problem
Lambda function is timing out during initialization phase, causing 403/502 errors when accessed through CloudFront.

## Symptoms
- Lambda logs show: `INIT_REPORT Init Duration: 10009.13 ms Phase: init Status: timeout`
- Next.js server starts successfully ("Ready in 153ms")
- Lambda Web Adapter appears to not be detecting/communicating with the server
- Direct Lambda Function URL returns 502 Internal Server Error
- CloudFront returns 403 Forbidden (cached error)

## Root Cause
The Lambda Web Adapter is installed but appears to be timing out during the initialization phase. The adapter needs to:
1. Start the Next.js server
2. Detect that it's running on PORT 8080
3. Report readiness to Lambda

The timeout suggests the adapter isn't successfully completing this handshake.

## Current Configuration
- **Lambda Timeout**: 60 seconds (increased from 30)
- **Lambda Memory**: 1024 MB (increased from 512)
- **Lambda Web Adapter**: Version 0.6.0 from `public.ecr.aws/awsguru/aws-lambda-adapter`
- **Port**: 8080
- **User**: nextjs (non-root)

## Potential Solutions

### Option 1: Verify Lambda Web Adapter Configuration
The adapter should automatically detect the server. Check if:
- Server is binding to `0.0.0.0:8080` (not `localhost:8080`)
- Adapter has proper permissions to access the server
- Environment variables are set correctly

### Option 2: Use Lambda Runtime API Directly
Instead of Lambda Web Adapter, implement a Lambda handler that uses the Runtime API directly. This gives more control but requires more code.

### Option 3: Use AWS Lambda Web Adapter Layer
Instead of copying the adapter binary, use the official Lambda layer. This might have better compatibility.

### Option 4: Check Adapter Logs
Enable more verbose logging to see what the adapter is doing during init.

## Next Steps
1. Check Lambda Web Adapter documentation for latest best practices
2. Verify the adapter version compatibility with Lambda Function URLs
3. Consider testing with a simpler HTTP server to isolate the issue
4. Review AWS Lambda container image best practices

