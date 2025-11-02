# Terraform Workspaces Guide

## Overview

This project uses Terraform workspaces to manage separate dev and prod environments. Each workspace has its own state file, allowing independent deployments.

## Quick Start

### Deploy to Dev
```bash
npm run deploy:dev
```

### Deploy to Prod
```bash
npm run deploy:prod
```

## Workspace Management

### List workspaces
```bash
npm run terraform:workspace list
```

### Switch workspace
```bash
npm run workspace:dev    # Switch to dev
npm run workspace:prod   # Switch to prod
```

### Current workspace
```bash
cd terraform && terraform workspace show
```

## Environment-Specific Configuration

### Using terraform.tfvars (Recommended)

1. **Copy the example file for your environment:**
   ```bash
   # For dev
   cp terraform.tfvars.dev.example terraform/terraform.tfvars
   
   # For prod (after switching workspace)
   cp terraform.tfvars.prod.example terraform/terraform.tfvars
   ```

2. **Customize values** in `terraform.tfvars` as needed

3. **Workspace-specific files are automatically ignored** (via .gitignore)

### Current Structure

- **Same code** → Used for both environments
- **Different state files** → Stored in `.terraform/terraform.tfstate.d/<workspace>/`
- **Different variables** → Set via `-var` flags or `terraform.tfvars`

## Future: Environment-Specific Code

If you need environment-specific Terraform code later, you have options:

### Option 1: Conditional Resources (Stay in Workspace)
```hcl
# In your .tf files
resource "aws_xyz" "example" {
  count = var.stage == "prod" ? 1 : 0
  # Prod-only resource
}
```

### Option 2: Separate Directories (Migration Path)
If you need completely different configurations:
```
terraform/
  ├── environments/
  │   ├── dev/
  │   │   └── (dev-specific configs)
  │   └── prod/
  │       └── (prod-specific configs)
  └── modules/
      └── (shared code)
```

Migration from workspaces to directories is straightforward since the code structure stays the same.

## Best Practices

1. **Always verify workspace** before deploying:
   ```bash
   terraform workspace show
   ```

2. **Use terraform.tfvars** for environment-specific values (don't commit `.tfvars`)

3. **Plan before apply** in prod:
   ```bash
   npm run workspace:prod
   cd terraform && terraform plan -var='stage=prod'
   ```

4. **Separate state files** prevent accidental cross-environment changes

