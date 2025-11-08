# Force Rebuilding All Lambda Functions

The Lambda functions are automatically rebuilt when source code changes, but sometimes you may want to force a rebuild:

## Automatic Rebuilds

Terraform automatically rebuilds all Lambda functions when:
- Any `.ts` file in `handlers/`, `lib/`, or `shared/` changes
- `package.json`, `package-lock.json`, or `tsconfig.json` changes
- The build script (`scripts/build-lambda.sh`) changes

## Force Rebuild Methods

### Method 1: Touch a source file (quickest)
```bash
touch handlers/test.ts
cd terraform
terraform apply
```

### Method 2: Manual build + apply
```bash
./scripts/build-lambda.sh
cd terraform
terraform apply
```

### Method 3: Rebuild specific Lambda
```bash
./scripts/build-lambda.sh authorizer  # Only builds authorizer
cd terraform
terraform apply
```

### Method 4: Force via Terraform taint
```bash
cd terraform
terraform taint null_resource.build_lambda
terraform apply
```

## Verify Rebuild

After `terraform apply`, check that all Lambda functions were updated:
```bash
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `syniad`)].FunctionName' --output table
```

Or check the last modified time:
```bash
aws lambda get-function --function-name syniad-dev-authorizer --query 'Configuration.LastModified'
```

