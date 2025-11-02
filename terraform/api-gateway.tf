# API Gateway REST API
resource "aws_apigatewayv2_api" "api" {
  name          = "${local.service_name}-api"
  protocol_type = "HTTP"
  description   = "Syniad API"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }

  tags = local.common_tags
}

# API Gateway Integration for Test
resource "aws_apigatewayv2_integration" "test" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.test.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for CreateGame
resource "aws_apigatewayv2_integration" "create_game" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.create_game.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for JoinGame
resource "aws_apigatewayv2_integration" "join_game" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.join_game.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for GetGame
resource "aws_apigatewayv2_integration" "get_game" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_game.invoke_arn
  integration_method = "POST"
}

# API Gateway Authorizer
resource "aws_apigatewayv2_authorizer" "api_authorizer" {
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type = "REQUEST"
  authorizer_uri  = aws_lambda_function.authorizer.invoke_arn
  identity_sources = [
    "$request.header.Authorization"
  ]
  authorizer_payload_format_version = "2.0"
  enable_simple_responses = false  # Set to false to pass context to Lambda handlers
  name = "${local.service_name}-authorizer"
}

# API Gateway Route for Test
resource "aws_apigatewayv2_route" "test" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /test"
  target    = "integrations/${aws_apigatewayv2_integration.test.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for CreateGame
resource "aws_apigatewayv2_route" "create_game" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /games"
  target    = "integrations/${aws_apigatewayv2_integration.create_game.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for JoinGame
resource "aws_apigatewayv2_route" "join_game" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /games/{gameId}/join"
  target    = "integrations/${aws_apigatewayv2_integration.join_game.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetGame
resource "aws_apigatewayv2_route" "get_game" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/{gameId}"
  target    = "integrations/${aws_apigatewayv2_integration.get_game.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = var.stage
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 50
  }

  tags = local.common_tags
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "test_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.test.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "create_game_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "join_game_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.join_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_game_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# Lambda permission for API Gateway to invoke authorizer
resource "aws_lambda_permission" "authorizer_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/authorizers/*"
}

