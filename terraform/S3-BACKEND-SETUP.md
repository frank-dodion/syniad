# S3 Backend Setup Guide

This project uses S3 for Terraform remote state storage. The backend is already configured and active.

## Current Configuration

- **S3 Bucket**: `syniad-terraform-state-054919302645`
- **Region**: `us-east-1`
- **Encryption**: Enabled (AES256)
- **Versioning**: Enabled
- **State Location**: All state is stored in S3, not locally

## Creating the S3 Backend Bucket

The S3 bucket for Terraform state must be created **before** configuring the Terraform backend. Use these AWS CLI commands:

```bash
# Get your AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="syniad-terraform-state-${ACCOUNT_ID}"
REGION="us-east-1"

# Create the S3 bucket
# Note: For us-east-1, omit LocationConstraint. For other regions, use:
# --create-bucket-configuration LocationConstraint=${REGION}
aws s3api create-bucket \
  --bucket "${BUCKET_NAME}"

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "${BUCKET_NAME}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

After creating the bucket, update the `bucket` name in `terraform/main.tf` backend configuration to match your bucket name.

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

## Migrating to S3 Backend

If you have existing local state and need to migrate to S3:

1. Create the bucket using the AWS CLI commands above
2. Update the backend configuration in `terraform/main.tf` with your bucket name
3. Initialize and migrate state:
   ```bash
   cd terraform
   terraform init -migrate-state
   ```
4. Repeat for each workspace:
   ```bash
   terraform workspace select dev
   terraform init -migrate-state
   
   terraform workspace select prod
   terraform init -migrate-state
   ```

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
