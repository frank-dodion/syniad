# Keeping OpenAPI Spec in Sync with Implementation

This document explains how we maintain synchronization between the OpenAPI specification and the API implementation.

## Strategy

We use a **multi-layered approach** to keep the spec and implementation synchronized:

### 1. **Type Generation** (Spec → Code)

TypeScript types are automatically generated from the OpenAPI spec:

```bash
npm run docs:generate-types
```

This generates `shared/openapi-types.ts` containing TypeScript types for all API schemas. These types can be used:
- As reference when implementing handlers
- For type checking in TypeScript
- To catch breaking changes early

**Automated:** Types are regenerated automatically before builds (`prebuild` hook).

### 2. **Spec Validation** (Standalone)

The OpenAPI spec itself is validated for correctness:

```bash
npm run docs:validate
```

This checks:
- Valid OpenAPI 3.0 format
- Required fields are present
- All path parameters are documented
- All endpoints have operation IDs
- Response schemas are defined
- Security schemes are properly configured

**When to run:** Before committing spec changes, or in CI/CD.

### 3. **Response Validation Tests** (Implementation → Spec)

Integration tests validate that actual API responses match the OpenAPI spec:

```bash
npm test -- --testPathPattern=openapi-validation
```

These tests:
- Make real API requests
- Validate responses against OpenAPI schemas
- Fail if responses don't match the spec
- Help catch drift between implementation and spec

**When to run:** As part of the regular test suite.

### 4. **Combined Check** (CI/CD)

A single command runs all validation checks:

```bash
npm run docs:check
```

This:
1. Generates types from spec
2. Validates spec structure
3. Runs TypeScript type checking

**Use in CI/CD:** Run this in your CI pipeline before deploying.

## Workflow

### When Adding a New Endpoint

1. **Update the OpenAPI spec first** (`docs/openapi.yaml`)
   - Define the endpoint path and method
   - Document request/response schemas
   - Add operation ID
   - Document parameters

2. **Generate types**
   ```bash
   npm run docs:generate-types
   ```

3. **Implement the handler**
   - Use generated types as reference
   - Ensure response format matches spec

4. **Write tests**
   - Add integration tests
   - Add OpenAPI validation test

5. **Validate everything**
   ```bash
   npm run docs:check
   npm test
   ```

### When Modifying an Existing Endpoint

1. **Update both spec and implementation together**
   - Don't let them drift
   - Update spec → generate types → update code

2. **Run validation**
   ```bash
   npm run docs:check
   npm test -- --testPathPattern=openapi-validation
   ```

3. **Fix any validation errors**
   - Adjust spec OR implementation to match
   - Run checks again until passing

## CI/CD Integration

Add this to your CI pipeline:

```yaml
# .github/workflows/ci.yml (example)
- name: Validate OpenAPI Spec
  run: |
    npm install
    npm run docs:check
    
- name: Run OpenAPI Validation Tests
  run: |
    npm test -- --testPathPattern=openapi-validation
```

## Troubleshooting

### Types are out of sync

```bash
npm run docs:generate-types
npm run typecheck
```

### Spec validation fails

Check the error message - common issues:
- Missing operation IDs
- Undefined path parameters
- Missing response schemas
- Invalid references to schemas

### Response validation tests fail

This means your implementation doesn't match the spec. Options:

1. **Update the implementation** to match spec (recommended if spec is correct)
2. **Update the spec** to match implementation (if implementation is correct and spec is wrong)

## Best Practices

1. **Spec-first for new features** - Design in the spec, then implement
2. **Update spec with code changes** - Never change code without updating spec
3. **Run validation frequently** - Catch issues early
4. **Use generated types** - Reference them in your handlers
5. **Test against spec** - OpenAPI validation tests catch drift automatically

## Tools Used

- **openapi-typescript** - Generates TypeScript types from OpenAPI spec
- **ajv** - JSON Schema validator for response validation
- **yaml** - YAML parser for spec validation
- **Jest** - Test framework for validation tests

