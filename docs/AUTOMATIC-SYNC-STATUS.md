# Automatic Swagger Docs Sync Status

## ✅ What IS Automatic

### 1. **Spec Deployment** (Fully Automatic)
- ✅ When you update `docs/openapi.yaml`, Terraform detects the change
- ✅ Lambda build is triggered automatically (includes OpenAPI spec hash in triggers)
- ✅ Spec is copied into docs Lambda package during build
- ✅ Deployment updates the live `/docs` endpoint
- **Result**: Updated spec appears at `/docs` automatically on next deploy

### 2. **Type Generation** (Fully Automatic)
- ✅ Types are generated from spec before every build (`prebuild` hook)
- ✅ No manual step needed
- **Result**: Code types stay in sync with spec

### 3. **Build Detection** (Fully Automatic)
- ✅ Terraform triggers rebuild when:
  - Handler code changes
  - OpenAPI spec changes (`docs/openapi.yaml`)
  - Build script changes
  - Configuration changes
- **Result**: Docs Lambda rebuilds and redeploys when spec changes

## ⚠️ What Requires Manual Updates

### 1. **Spec Content Updates** (Manual)
- ❌ You still need to manually update `docs/openapi.yaml` when you:
  - Add a new endpoint
  - Change request/response schemas
  - Modify parameters
  - Update error responses

**Why**: There's no code-first OpenAPI generation (spec-first approach). This is intentional because:
- Better for API design (think about contract first)
- More control over documentation quality
- Avoids implementation details leaking into docs

### 2. **Validation** (Manual Trigger)
- ❌ Validation tests don't run automatically
- ✅ But they will catch issues when you run `npm test`
- ✅ CI/CD can run them automatically

## Current Workflow

When you make API changes:

```
1. Update API handler code
   ↓
2. Update docs/openapi.yaml (manual step)
   ↓
3. Run: npm run docs:check (validates spec structure)
   ↓
4. Run: npm test (validates responses match spec)
   ↓
5. Deploy: npm run deploy:dev
   ↓
6. Terraform detects spec change → rebuilds docs Lambda → deploys
   ↓
7. /docs endpoint automatically shows updated spec ✅
```

## Making It More Automatic

If you want fully automatic spec generation from code, you would need:

1. **Code-first OpenAPI generation** (e.g., using decorators, annotations, or frameworks)
   - Requires refactoring to use a framework like NestJS, Fastify with plugins, etc.
   - Automatically generates spec from code annotations
   - Trade-off: Less control over documentation, implementation details in docs

2. **Response Schema Inference** (partially possible)
   - Could add runtime schema extraction
   - Would require middleware to capture request/response schemas
   - Trade-off: May miss edge cases, harder to document intent

## Recommendation

The current approach is a **good balance**:
- ✅ Spec deployment is automatic (once you update the YAML)
- ✅ Validation catches drift between spec and code
- ✅ Type generation helps keep code aligned with spec
- ⚠️ Manual spec updates ensure high-quality, intentional documentation

**Best Practice**: Update the spec alongside code changes as part of your development workflow.

