# S3 Backend Setup Guide

This project uses S3 for Terraform remote state storage. The backend is already configured and active.

## Current Configuration

- **S3 Bucket**: `syniad-terraform-state-054919302645`
- **Region**: `us-east-1`
- **Encryption**: Enabled (AES256)
- **Versioning**: Enabled
- **State Location**: All state is stored in S3, not locally

## Verify S3 Backend

Check that state is stored in S3:

```bash
cd terraform
aws s3 ls s3://syniad-terraform-state-054919302645/ --recursive
```

You should see output showing the state files with timestamps and sizes:

```
2025-11-02 17:57:27      67157 env:/dev/terraform.tfstate
2025-11-02 17:57:29      60751 env:/prod/terraform.tfstate
```

Note: The timestamps and file sizes shown above are examples. Your actual values will be different, but you should see both state files under the `env:/` prefix.

To see just the directory structure:

```bash
cd terraform
aws s3 ls s3://syniad-terraform-state-054919302645/
```

Output:

```
PRE env:/
```

## Workspace Support

Terraform workspaces are automatically supported. Each workspace state is stored at:

- `env:/dev/terraform.tfstate`
- `env:/prod/terraform.tfstate`

The `env:/` prefix is automatically added by Terraform when using workspaces with S3 backend.

## Backend Configuration

The S3 backend is configured in `terraform/main.tf`:

```hcl
  backend "s3" {
    bucket  = "syniad-terraform-state-054919302645"
    key     = "terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
```

**Note:** There are outdated setup comments in `terraform/main.tf` above the backend block. These can be ignored - the backend is already active and configured.

## Features

- **Versioning**: Enabled on the S3 bucket (allows state rollback)
- **Encryption**: AES256 server-side encryption
- **Public Access**: Blocked for security

## Bootstrap Resources

The S3 bucket and its configuration are managed by Terraform in `terraform/bootstrap-backend.tf`. These resources are part of your infrastructure and are managed like any other Terraform resource.

To see the bucket details:

```bash
cd terraform
terraform output terraform_state_bucket
```

## Initial Setup (Already Complete)

The S3 backend has already been set up. The setup process was:

1. Created S3 bucket with versioning and encryption via `terraform/bootstrap-backend.tf`
2. Configured backend in `terraform/main.tf`
3. Migrated state from local files to S3 using `terraform init -migrate-state` (run from `terraform/` directory)
4. Removed old local state files from `terraform/terraform.tfstate.d/`

## Troubleshooting

**If Terraform can't access S3:**

- Verify AWS credentials are configured: `aws sts get-caller-identity`
- Check bucket exists: `aws s3 ls s3://syniad-terraform-state-054919302645/`
- Verify bucket permissions

**If you see local state files:**

- Local state files in `terraform/terraform.tfstate.d/` are old backups and can be safely removed
- Terraform now uses only S3 for state storage
- The `terraform/.terraform/terraform.tfstate` file tracks backend configuration and should remain

**To view current state:**

```bash
cd terraform
terraform workspace show  # Shows current workspace
terraform state list       # Lists all resources in current workspace
```
