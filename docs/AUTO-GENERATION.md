# Automatic OpenAPI Specification Generation

The OpenAPI specification is **automatically generated** from your Terraform routes and code on every build.

## How It Works

### Automatic Generation on Build

The OpenAPI spec is regenerated automatically before every build:

```bash
npm run build          # Runs: docs:generate → docs:generate-types → tsc
npm run build:lambda   # Same generation happens before Lambda build
npm run deploy:dev     # Spec is generated, then built into Lambda, then deployed
```

### What Gets Generated

The generator extracts:

1. **Routes from Terraform** (`terraform/api-gateway.tf`)
   - HTTP methods (GET, POST, etc.)
   - Path patterns (including path parameters)
   - Authentication requirements

2. **Types from Code** (`shared/types.ts`)
   - Game schema
   - Player schema
   - Other shared types

3. **Response Schemas**
   - Based on endpoint patterns
   - Merged with existing custom schemas

### What Gets Preserved

When regenerating, the script preserves:
- ✅ Custom descriptions and summaries
- ✅ Operation IDs (if already defined)
- ✅ Request body schemas and examples
- ✅ Response examples
- ✅ Custom component schemas
- ✅ API info (title, version, contact, etc.)

## Workflow

### Normal Development

1. **Add a new route** in `terraform/api-gateway.tf`:
   ```hcl
   route_key = "GET /new-endpoint"
   ```

2. **Build or deploy**:
   ```bash
   npm run build:lambda
   ```

3. **Spec is automatically updated**:
   - New endpoint appears in `docs/openapi.yaml`
   - Basic structure is generated
   - You can add custom descriptions/examples if needed

### Customizing Generated Spec

If you want to add custom descriptions, examples, or detailed schemas:

1. **Add custom content** to `docs/openapi.yaml` manually
2. **Regenerate** - your custom content is preserved
3. The generator will:
   - Add any new routes you've created
   - Keep your custom descriptions/examples
   - Update path structures if routes changed

### Forcing Full Regeneration

To regenerate from scratch (losing custom content):

```bash
# Backup existing spec
cp docs/openapi.yaml docs/openapi.yaml.backup

# Delete and regenerate
rm docs/openapi.yaml
npm run docs:generate
```

## Integration Points

### Pre-build Hook

The `prebuild` script in `package.json` ensures:
```json
"prebuild": "npm run docs:generate && npm run docs:generate-types"
```

This means:
- Every `npm run build` automatically regenerates the spec
- Every `npm run build:lambda` regenerates before Lambda build
- Types are always in sync with the latest spec

### Terraform Triggers

Terraform rebuilds when:
- Handler code changes
- OpenAPI spec changes (including generated updates)
- Build script changes

So when you add a new route and deploy:
1. Spec is regenerated with new route
2. Terraform detects spec change
3. Docs Lambda rebuilds
4. New route appears at `/docs`

## Manual Overrides

You can still manually edit `docs/openapi.yaml` for:
- Detailed descriptions
- Complex request/response examples
- Custom validation rules
- Documentation-only endpoints

The generator will preserve your changes on the next regeneration.

## Example: Adding a New Endpoint

1. **Add route to Terraform**:
   ```hcl
   resource "aws_apigatewayv2_route" "new_endpoint" {
     route_key = "GET /new-endpoint"
     ...
   }
   ```

2. **Run build**:
   ```bash
   npm run build:lambda
   ```

3. **Result**:
   - Spec automatically includes `GET /new-endpoint`
   - Basic operation structure is generated
   - `/docs` endpoint shows the new route after deployment

4. **(Optional) Add custom details**:
   - Edit `docs/openapi.yaml`
   - Add detailed description, examples, etc.
   - Next regeneration preserves your additions

## Validation

After generation, validation runs automatically:
- Checks OpenAPI structure
- Validates all routes have operation IDs
- Ensures schemas are properly defined

## Limitations

Current generator:
- ✅ Extracts routes and methods automatically
- ✅ Generates basic parameter definitions
- ✅ Creates response schemas from patterns
- ⚠️ May not capture all complex request/response details
- ⚠️ Examples need manual addition
- ⚠️ Complex validation rules need manual definition

**Best Practice**: Let the generator create the structure, then add custom details as needed.

