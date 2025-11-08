# API Documentation Deployment

The API documentation is automatically served at `/docs` when deployed.

## Endpoints

Once your API is deployed, the documentation is available at:

- **`GET /docs`** - Swagger UI interface (interactive documentation)
- **`GET /docs/openapi.yaml`** - OpenAPI specification in YAML format

Both endpoints are publicly accessible (no authentication required), though testing API endpoints through Swagger UI will require authentication tokens.

## Automatic Updates

The documentation is **automatically kept in sync** with the deployed API:

1. **Build Process**: When you run `npm run build:lambda`, the `docs/openapi.yaml` file is copied into the docs Lambda package
2. **Deployment**: Terraform automatically deploys the docs Lambda with the latest spec
3. **Live Updates**: When you update `docs/openapi.yaml` and redeploy, the changes appear immediately at `/docs`

## Using the Documentation

### Viewing Docs

Simply navigate to `https://your-api-url.com/docs` in your browser. The Swagger UI will:
- Load automatically
- Use the current API server URL
- Show all endpoints with their schemas
- Allow you to test endpoints interactively

### Setting Auth Token

To test authenticated endpoints in Swagger UI:

1. Get your JWT token (from `.env` or by running `./scripts/test-cognito-auth.sh`)
2. Open browser console (F12)
3. Run: `setAuthToken("your-jwt-token-here")`
4. The page will reload and all requests will include the token

### Downloading the Spec

You can download the OpenAPI specification directly:
```bash
curl https://your-api-url.com/docs/openapi.yaml > openapi.yaml
```

This is useful for:
- Importing into Postman
- Generating client SDKs
- API gateway integrations
- Documentation tools

## Technical Details

- **Lambda Function**: `docs` handler serves both HTML and YAML
- **Routes**: Defined in `terraform/api-gateway.tf`
- **Build**: OpenAPI spec is copied during `scripts/build-lambda.sh`
- **No Auth**: Docs endpoints use `authorization_type = "NONE"` for public access

## Troubleshooting

### Docs not showing

1. Ensure `docs` Lambda is built: `npm run build:lambda`
2. Check Terraform deployment: `terraform apply`
3. Verify routes exist: Check API Gateway routes in AWS console

### Spec not found error

The Lambda looks for the spec in several locations:
- `__dirname/docs/openapi.yaml` (primary)
- `process.cwd()/docs/openapi.yaml`
- Other fallback locations

If you see this error, check that `docs/openapi.yaml` exists in the Lambda package.

