# Running Docker Apps Locally

This guide explains how to run the Next.js applications locally using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- Next.js apps built (static files generated)

## Quick Start

1. **Set up environment variables**:
   ```bash
   ./scripts/setup-local-env.sh
   # This creates .env file and tries to get Cognito values from Terraform
   # Edit .env if needed
   ```

2. **Build the Next.js apps** (generates static files):
   ```bash
   cd frontend/scenario-editor
   npm install
   npm run build
   
   cd ../game
   npm install
   npm run build
   ```

3. **Start the services**:
   ```bash
   docker-compose up --build
   ```

4. **Access the apps**:
   - Scenario Editor: http://localhost:3001
   - Game: http://localhost:3002

## Environment Variables

### Using .env file

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Key variables:
- `NEXT_PUBLIC_API_URL` - API server URL (default: http://localhost:3000)
- `COGNITO_USER_POOL_ID` - AWS Cognito User Pool ID
- `COGNITO_CLIENT_ID` - AWS Cognito App Client ID
- `COGNITO_DOMAIN` - Cognito domain for authentication

### Getting Cognito Values

Get values from Terraform outputs:
```bash
cd terraform
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_domain
```

Or from AWS Console:
- Cognito User Pool ID: AWS Console → Cognito → User Pools
- Client ID: User Pool → App integration → App clients
- Domain: User Pool → App integration → Domain

## Static Files

When running locally:
- `NEXT_PUBLIC_ASSET_PREFIX` is **empty** (default)
- Static files are served from the container's `/var/task/.next/static/` directory
- The docker-compose.yml mounts local `.next/static` directories for easier development

## Development Workflow

### Rebuilding after code changes:

1. **Rebuild Next.js app**:
   ```bash
   cd frontend/scenario-editor
   npm run build
   ```

2. **Rebuild Docker container**:
   ```bash
   docker-compose build scenario-editor
   docker-compose up scenario-editor
   ```

### Hot reloading static files:

The docker-compose.yml mounts the local `.next/static` directory, so if you rebuild the Next.js app, the static files will be updated in the container without rebuilding the Docker image.

### Full rebuild:

```bash
docker-compose down
docker-compose up --build
```

## Troubleshooting

### Static files not loading

1. Make sure you've built the Next.js app: `npm run build`
2. Check that `.next/static` directory exists
3. Verify the volume mount in docker-compose.yml

### Authentication not working

1. Verify Cognito environment variables are set correctly
2. Check that `NEXTAUTH_URL` matches the URL you're accessing
3. Ensure Cognito domain is accessible from your network

### Port conflicts

If ports 3001 or 3002 are in use, modify `docker-compose.yml`:
```yaml
ports:
  - "3003:8080"  # Change 3001 to 3003
```

## Differences from Production

| Feature | Local (Docker) | Production (Lambda) |
|---------|---------------|---------------------|
| Static Assets | Local files in container | S3 + CloudFront |
| Asset Prefix | Empty (local) | CloudFront URL |
| Port | 8080 (mapped to host) | 8080 (Lambda) |
| Base Image | Alpine (custom) | Alpine (custom) |
| Web Adapter | Not needed | Lambda layer |

## Running Individual Services

Run only one service:
```bash
docker-compose up scenario-editor
# or
docker-compose up game
```

Run in background:
```bash
docker-compose up -d
```

View logs:
```bash
docker-compose logs -f scenario-editor
```

Stop services:
```bash
docker-compose down
```

