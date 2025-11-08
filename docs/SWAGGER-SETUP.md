# Swagger Documentation Setup

The Swagger UI and OpenAPI spec are **automatically generated and deployed** with your API.

## What's Required

**Minimal setup (for automatic docs):**
- `scripts/generate-openapi.js` - Generates spec from Terraform routes
- `yaml` package - Used by generator
- `npm run docs:generate` - Runs automatically in `prebuild` hook

That's it! The spec is automatically:
1. Generated before every build
2. Bundled into the docs Lambda
3. Deployed at `/docs` endpoint (public, no auth)

## Optional Tools

These are available for manual use but not required:

### Type Generation
```bash
npm run docs:generate-types  # Generates TypeScript types from spec
```
- Generates `shared/openapi-types.ts` 
- Useful if you want to use generated types in your code
- Not needed for basic docs deployment

### Validation
```bash
npm run docs:validate       # Validates spec structure
npm run docs:check          # Full validation + typecheck
```
- Checks spec for errors before committing
- Useful for CI/CD
- Not needed for deployment

### Local Development
```bash
npm run docs:serve          # Serve Swagger UI locally
npm run docs:open           # Same as above
```
- View docs locally before deploying
- Not needed if you just use `/docs` on deployed API

### Dependencies Used

**Required:**
- `yaml` - For parsing/generating YAML

**Optional (only if using validation/types):**
- `openapi-typescript` - For type generation
- `ajv` / `ajv-formats` - For response validation tests

## How It Works

1. **Build time**: `prebuild` hook runs `docs:generate`
2. **Generator extracts**:
   - Routes from `terraform/api-gateway.tf`
   - Auth requirements (public vs protected)
   - Basic schemas from code
3. **Preserves** custom descriptions/examples you add manually
4. **Terraform detects** spec changes and rebuilds docs Lambda
5. **Deployment** updates `/docs` endpoint automatically

## Customizing

You can manually edit `docs/openapi.yaml` to add:
- Detailed descriptions
- Request/response examples
- Complex validation rules

The generator will preserve your custom content on next generation.

