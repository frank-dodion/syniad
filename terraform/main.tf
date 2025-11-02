terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # S3 backend for remote state storage
  # Step 1: Comment out this backend block temporarily
  # Step 2: Run terraform apply to create the S3 bucket
  # Step 3: Get the bucket name from terraform output terraform_state_bucket
  # Step 4: Uncomment this block and update the bucket name below
  # Step 5: Run terraform init -migrate-state

  backend "s3" {
    bucket  = "syniad-terraform-state-054919302645"
    key     = "terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
}

# Provider alias for us-east-1 (required for ACM certificate used by API Gateway)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Data source for Lambda runtime
data "aws_caller_identity" "current" {}

