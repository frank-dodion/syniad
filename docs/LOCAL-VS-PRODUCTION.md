# Local vs Production Configuration

This document explains how authentication and static file loading work in both local Docker and Lambda deployments.

## Static File Loading

### Local Docker (docker-compose.yml)
- **`NEXT_PUBLIC_ASSET_PREFIX`**: Empty string (`""`)
- **Behavior**: Next.js uses relative paths for static assets
- **Source**: Static files served from container's `/var/task/.next/static/` directory
- **Volume Mount**: Local `.next/static` directory is mounted for easier development

### Production Lambda (Terraform)
- **`NEXT_PUBLIC_ASSET_PREFIX`**: Set to CloudFront distribution URL
  - Scenario Editor: `https://${aws_cloudfront_distribution.scenario_editor.domain_name}`
  - Game: `https://${aws_cloudfront_distribution.frontend.domain_name}`
- **Behavior**: Next.js prepends CloudFront URL to static asset paths
- **Source**: Static files served from S3 via CloudFront CDN
- **Cache**: CloudFront caches static assets with 1-year TTL

### How It Works
The Next.js config uses:
```javascript
assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || ''
```

- **Empty/undefined**: Next.js generates relative paths like `/_next/static/...`
- **Set to URL**: Next.js generates absolute paths like `https://cloudfront.net/_next/static/...`

## Authentication

### Local Docker (docker-compose.yml)
- **`NEXT_PUBLIC_FRONTEND_URL`**: `http://localhost:3001` (scenario-editor) or `http://localhost:3002` (game)
- **`NEXTAUTH_URL`**: Matches `NEXT_PUBLIC_FRONTEND_URL`
- **`BETTER_AUTH_SECRET`**: Local dev secret (can be overridden via `.env`)
- **Cognito Config**: Read from environment variables (can be set in `.env` file)
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_CLIENT_ID`
  - `COGNITO_CLIENT_SECRET` (empty for public clients)
  - `COGNITO_REGION`
  - `COGNITO_DOMAIN`

### Production Lambda (Terraform)
- **`NEXT_PUBLIC_FRONTEND_URL`**: Production domain (e.g., `https://editor.dev.syniad.net`)
- **`NEXTAUTH_URL`**: Matches `NEXT_PUBLIC_FRONTEND_URL`
- **`BETTER_AUTH_SECRET`**: Generated UUID (stored in Terraform state)
- **Cognito Config**: Automatically set from Terraform resources
  - `COGNITO_USER_POOL_ID`: From `aws_cognito_user_pool.users.id`
  - `COGNITO_CLIENT_ID`: From `aws_cognito_user_pool_client.web_client.id`
  - `COGNITO_CLIENT_SECRET`: Empty (public client)
  - `COGNITO_REGION`: From `var.aws_region`
  - `COGNITO_DOMAIN`: From `aws_cognito_user_pool_domain.auth_domain.domain`

### Auth Configuration
The auth library (`lib/auth.ts`) uses:
- **`baseURL`**: From `NEXT_PUBLIC_FRONTEND_URL` environment variable
- **`trustedOrigins`**: Includes baseURL + common local/production URLs
  - Automatically includes the configured `baseURL`
  - Includes `http://localhost:3001`, `http://localhost:3002` for local Docker
  - Includes production domains

## Environment Variable Summary

| Variable | Local Docker | Production Lambda |
|----------|-------------|-------------------|
| `NEXT_PUBLIC_ASSET_PREFIX` | `""` (empty) | CloudFront URL |
| `NEXT_PUBLIC_FRONTEND_URL` | `http://localhost:3001/3002` | Production domain |
| `NEXTAUTH_URL` | `http://localhost:3001/3002` | Production domain |
| `BETTER_AUTH_SECRET` | Local dev secret | Generated UUID |
| `COGNITO_*` | From `.env` or defaults | From Terraform |

## Verification Checklist

### Static Files
- ✅ Local: `NEXT_PUBLIC_ASSET_PREFIX` is empty in docker-compose.yml
- ✅ Production: `NEXT_PUBLIC_ASSET_PREFIX` is set to CloudFront URL in Terraform
- ✅ Next.js config uses `process.env.NEXT_PUBLIC_ASSET_PREFIX || ''`
- ✅ Static files are built into Docker images
- ✅ Static files are uploaded to S3 for production

### Authentication
- ✅ Local: All Cognito env vars are set in docker-compose.yml
- ✅ Production: All Cognito env vars are set in Terraform
- ✅ Auth config reads from environment variables
- ✅ `baseURL` uses `NEXT_PUBLIC_FRONTEND_URL`
- ✅ `trustedOrigins` includes baseURL and local/production URLs
- ✅ Cognito OAuth redirects use the correct `baseURL`

## Testing

### Test Local Static Files
1. Build Next.js app: `npm run build`
2. Start Docker: `docker-compose up`
3. Check browser console: Static assets should load from `/_next/static/...` (relative paths)

### Test Production Static Files
1. Deploy to Lambda: `terraform apply`
2. Check browser console: Static assets should load from `https://cloudfront.net/_next/static/...` (absolute paths)

### Test Local Auth
1. Set Cognito values in `.env` file
2. Start Docker: `docker-compose up`
3. Navigate to app and click login
4. Should redirect to Cognito, then back to `http://localhost:3001` (or 3002)

### Test Production Auth
1. Deploy to Lambda: `terraform apply`
2. Navigate to production URL
3. Click login
4. Should redirect to Cognito, then back to production domain

