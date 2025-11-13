#!/bin/bash
# Enable CloudWatch Logs for API Gateway WebSocket API
# This script sets up the necessary IAM role and enables logging

set -e

AWS_REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Setting up CloudWatch Logs for API Gateway..."
echo "Account ID: $ACCOUNT_ID"
echo "Region: $AWS_REGION"

# Step 1: Create IAM role for API Gateway to write to CloudWatch Logs
ROLE_NAME="AmazonAPIGatewayPushToCloudWatchLogs"

echo ""
echo "Step 1: Creating IAM role for API Gateway CloudWatch Logs..."

# Check if role already exists
if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "Role $ROLE_NAME already exists, skipping creation"
else
  echo "Creating role $ROLE_NAME..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "apigateway.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'
  
  echo "Attaching CloudWatch Logs policy to role..."
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs
  
  echo "Waiting for role to be ready..."
  sleep 5
fi

# Step 2: Set the role ARN in API Gateway account settings
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo ""
echo "Step 2: Configuring API Gateway account settings..."
echo "Setting CloudWatch Logs role ARN: $ROLE_ARN"

aws apigateway update-account \
  --patch-operations op=replace,path=/cloudwatchRoleArn,value="$ROLE_ARN" \
  --region "$AWS_REGION"

echo ""
echo "✓ CloudWatch Logs role configured for API Gateway"
echo ""
echo "Next steps:"
echo "1. Update terraform/websocket.tf to enable logging"
echo "2. Run: terraform apply"
echo ""

