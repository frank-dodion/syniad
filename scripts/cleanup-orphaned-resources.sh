#!/bin/bash

# Cleanup script for orphaned resources that Terraform wants to destroy
# This script empties S3 buckets and ECR repositories before Terraform destroys them
# Usage: ./scripts/cleanup-orphaned-resources.sh [stage]
# Default stage: dev

set -e

STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Cleanup Orphaned Resources           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Stage: ${STAGE}${NC}"
echo ""

# Resources to clean up
S3_BUCKETS=(
  "syniad-${STAGE}-scenario-editor"
  "syniad-${STAGE}-scenario-editor-static"
)

ECR_REPOS=(
  "syniad-${STAGE}-scenario-editor"
)

# Function to empty S3 bucket (including versions)
empty_s3_bucket() {
  local bucket=$1
  echo -e "${YELLOW}Emptying S3 bucket: ${bucket}${NC}"
  
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    # Delete all objects and versions
    echo "  Removing all objects and versions..."
    
    # Remove all object versions and delete markers
    aws s3api list-object-versions --bucket "$bucket" --output text 2>/dev/null | \
      grep -E "^(VERSIONS|DELETEMARKER)" | \
      awk '{print $3 "\t" $5}' | \
      while IFS=$'\t' read -r key version_id; do
        if [ -n "$key" ] && [ -n "$version_id" ] && [ "$key" != "None" ] && [ "$version_id" != "None" ]; then
          aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version_id" 2>/dev/null || true
        fi
      done
    
    # Also remove all current objects (non-versioned)
    echo "  Removing current objects..."
    aws s3 rm "s3://${bucket}/" --recursive 2>/dev/null || true
    
    echo -e "${GREEN}  ✓ Bucket emptied: ${bucket}${NC}"
  else
    echo -e "${YELLOW}  ⊘ Bucket does not exist: ${bucket}${NC}"
  fi
}

# Function to delete all images from ECR repository
empty_ecr_repo() {
  local repo=$1
  echo -e "${YELLOW}Emptying ECR repository: ${repo}${NC}"
  
  if aws ecr describe-repositories --repository-names "$repo" 2>/dev/null | grep -q "$repo"; then
    # Get all image tags
    local images=$(aws ecr list-images --repository-name "$repo" --query 'imageIds[*]' --output json 2>/dev/null || echo "[]")
    
    if [ "$images" != "[]" ] && [ -n "$images" ]; then
      echo "  Deleting all images..."
      aws ecr batch-delete-image --repository-name "$repo" --image-ids "$images" 2>/dev/null || true
      echo -e "${GREEN}  ✓ Repository emptied: ${repo}${NC}"
    else
      echo -e "${YELLOW}  ⊘ Repository is already empty: ${repo}${NC}"
    fi
  else
    echo -e "${YELLOW}  ⊘ Repository does not exist: ${repo}${NC}"
  fi
}


# Clean up S3 buckets
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 1: Emptying S3 buckets...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for bucket in "${S3_BUCKETS[@]}"; do
  empty_s3_bucket "$bucket"
done
echo ""

# Clean up ECR repositories
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Step 2: Emptying ECR repositories...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for repo in "${ECR_REPOS[@]}"; do
  empty_ecr_repo "$repo"
done
echo ""

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Cleanup Complete!               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}You can now run Terraform destroy/apply${NC}"
echo ""

