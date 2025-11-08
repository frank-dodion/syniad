# API Gateway HTTP API for Lambda integration
resource "aws_apigatewayv2_api" "game_api" {
  name          = "${local.service_name}-api"
  protocol_type = "HTTP"
  description   = "HTTP API Gateway for ${local.service_name} game app"

  cors_configuration {
    allow_credentials = true
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    max_age           = 300
  }

  tags = local.common_tags
}

# API Gateway integration with Lambda
resource "aws_apigatewayv2_integration" "game_lambda" {
  api_id           = aws_apigatewayv2_api.game_api.id
  integration_type  = "AWS_PROXY"
  integration_uri   = aws_lambda_function.game.invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

# Default route - catch all
resource "aws_apigatewayv2_route" "game_default" {
  api_id    = aws_apigatewayv2_api.game_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.game_lambda.id}"
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.game_api.execution_arn}/*/*"
}

# API Gateway stage
resource "aws_apigatewayv2_stage" "game_api_stage" {
  api_id      = aws_apigatewayv2_api.game_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 10000
    throttling_burst_limit = 5000
  }

  tags = local.common_tags
}

# Output the API Gateway endpoint
output "api_gateway_endpoint" {
  value = aws_apigatewayv2_api.game_api.api_endpoint
}

