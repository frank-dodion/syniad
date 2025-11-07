output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS Region"
  value       = var.aws_region
}

output "stage" {
  description = "Deployment stage"
  value       = var.stage
}

output "api_url" {
  description = "API URL (now in game app)"
  value       = "https://${local.frontend_domain_name}/api"
}

output "games_table_name" {
  description = "DynamoDB Games table name"
  value       = aws_dynamodb_table.games.name
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.users.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID (for frontend)"
  value       = aws_cognito_user_pool_client.web_client.id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain"
  value       = aws_cognito_user_pool_domain.auth_domain.domain
}

output "cognito_region" {
  description = "AWS region for Cognito"
  value       = var.aws_region
}

output "frontend_url" {
  description = "Frontend application URL"
  value       = "https://${local.frontend_domain_name}"
}

output "frontend_bucket_name" {
  description = "S3 bucket name for frontend"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for frontend"
  value       = aws_cloudfront_distribution.frontend.id
}

output "scenario_editor_url" {
  description = "Scenario editor application URL"
  value       = "https://${local.editor_domain_name}"
}

output "scenario_editor_bucket_name" {
  description = "S3 bucket name for scenario editor"
  value       = aws_s3_bucket.scenario_editor.id
}

output "scenario_editor_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for scenario editor"
  value       = aws_cloudfront_distribution.scenario_editor.id
}

output "scenario_editor_static_bucket_name" {
  description = "S3 bucket name for scenario editor static assets"
  value       = aws_s3_bucket.scenario_editor_static.id
}

output "game_static_bucket_name" {
  description = "S3 bucket name for game app static assets"
  value       = aws_s3_bucket.game_static.id
}

output "scenario_editor_lambda_function_url" {
  description = "Lambda Function URL for scenario editor"
  value       = aws_lambda_function_url.scenario_editor.function_url
}

output "game_lambda_function_url" {
  description = "Lambda Function URL for game app"
  value       = aws_lambda_function_url.game.function_url
}

