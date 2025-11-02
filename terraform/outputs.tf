output "api_url" {
  description = "API Gateway URL"
  value       = "${aws_apigatewayv2_api.api.api_endpoint}/${aws_apigatewayv2_stage.default.name}"
}

output "api_endpoint" {
  description = "API Gateway endpoint"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "games_table_name" {
  description = "DynamoDB Games table name"
  value       = aws_dynamodb_table.games.name
}

output "lambda_functions" {
  description = "Lambda function names"
  value = {
    test        = aws_lambda_function.test.function_name
    create_game = aws_lambda_function.create_game.function_name
    join_game   = aws_lambda_function.join_game.function_name
    get_game    = aws_lambda_function.get_game.function_name
    authorizer  = aws_lambda_function.authorizer.function_name
  }
}

output "custom_domain_name" {
  description = "API Gateway custom domain name"
  value       = aws_apigatewayv2_domain_name.api.domain_name
}

output "custom_domain_url" {
  description = "API Gateway custom domain URL"
  value       = "https://${aws_apigatewayv2_domain_name.api.domain_name}"
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

