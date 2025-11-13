# WebSocket API Gateway for Real-Time Game Communication

# Install dependencies for WebSocket Lambda handlers
resource "null_resource" "build_websocket_lambdas" {
  triggers = {
    connect_handler    = filesha256("${path.module}/../lambda-handlers/websocket-connect/index.js")
    connect_package    = filesha256("${path.module}/../lambda-handlers/websocket-connect/package.json")
    disconnect_handler = filesha256("${path.module}/../lambda-handlers/websocket-disconnect/index.js")
    disconnect_package = filesha256("${path.module}/../lambda-handlers/websocket-disconnect/package.json")
    message_handler    = filesha256("${path.module}/../lambda-handlers/websocket-message/index.js")
    message_package     = filesha256("${path.module}/../lambda-handlers/websocket-message/package.json")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/build-websocket-lambdas.sh"
    interpreter = ["bash", "-c"]
  }
}

# Data source to create zip files for Lambda deployment
data "archive_file" "websocket_connect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-handlers/websocket-connect"
  output_path = "${path.module}/../lambda-handlers/websocket-connect.zip"
  excludes    = ["node_modules/.cache"]
  
  depends_on = [null_resource.build_websocket_lambdas]
}

data "archive_file" "websocket_disconnect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-handlers/websocket-disconnect"
  output_path = "${path.module}/../lambda-handlers/websocket-disconnect.zip"
  excludes    = ["node_modules/.cache"]
  
  depends_on = [null_resource.build_websocket_lambdas]
}

data "archive_file" "websocket_message_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-handlers/websocket-message"
  output_path = "${path.module}/../lambda-handlers/websocket-message.zip"
  excludes    = ["node_modules/.cache"]
  
  depends_on = [null_resource.build_websocket_lambdas]
}

# Lambda function for WebSocket $connect
resource "aws_lambda_function" "websocket_connect" {
  function_name = "${local.service_name}-websocket-connect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = data.archive_file.websocket_connect_zip.output_path
  source_code_hash = data.archive_file.websocket_connect_zip.output_base64sha256

  environment {
    variables = {
      CONNECTIONS_TABLE  = aws_dynamodb_table.websocket_connections.name
      GAMES_TABLE        = aws_dynamodb_table.games.name
      WEBSOCKET_ENDPOINT = "https://${replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")}/${var.stage}"
    }
  }

  tags = local.common_tags
}

# WebSocket API Gateway (defined first so we can reference it in Lambda env vars)
resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${local.service_name}-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  
  tags = local.common_tags
}

# Lambda function for WebSocket $disconnect
resource "aws_lambda_function" "websocket_disconnect" {
  function_name = "${local.service_name}-websocket-disconnect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = data.archive_file.websocket_disconnect_zip.output_path
  source_code_hash = data.archive_file.websocket_disconnect_zip.output_base64sha256

  environment {
    variables = {
      CONNECTIONS_TABLE  = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT = "https://${replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")}/${var.stage}"
    }
  }

  tags = local.common_tags
}

# Lambda function for WebSocket $default (message handler)
resource "aws_lambda_function" "websocket_message" {
  function_name = "${local.service_name}-websocket-message"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.websocket_message_zip.output_path
  source_code_hash = data.archive_file.websocket_message_zip.output_base64sha256

  environment {
    variables = {
      CONNECTIONS_TABLE  = aws_dynamodb_table.websocket_connections.name
      GAMES_TABLE        = aws_dynamodb_table.games.name
      WEBSOCKET_ENDPOINT = "https://${replace(aws_apigatewayv2_api.websocket.api_endpoint, "wss://", "")}/${var.stage}"
    }
  }

  tags = local.common_tags
}

# WebSocket API Stage
resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.stage
  auto_deploy = true

  # CloudWatch logging - enable after running scripts/enable-api-gateway-logs.sh
  # This requires account-level CloudWatch Logs role ARN to be set
  # TEMPORARILY DISABLED to avoid costs - set to "ERROR" or "INFO" when debugging
  default_route_settings {
    logging_level            = "OFF"     # Temporarily disabled to avoid CloudWatch log costs
    data_trace_enabled       = false     # Set to true for detailed request/response logging (requires role)
    detailed_metrics_enabled = false     # Set to true for detailed metrics (requires role)
    # Throttle limits: These control rate limiting for WebSocket connections
    # Burst: Maximum concurrent connection attempts that can be processed immediately
    # Rate: Maximum connection attempts per second (sustained)
    # For a game: Allow 100 concurrent connection attempts, 200 per second sustained
    # This is generous for development and small-medium production loads
    throttling_burst_limit   = 100      # Allow burst of 100 concurrent connection attempts
    throttling_rate_limit    = 200      # Allow 200 connection attempts per second
  }

  tags = local.common_tags
}

# WebSocket $connect route
resource "aws_apigatewayv2_route" "websocket_connect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_connect.id}"
}

# WebSocket $disconnect route
resource "aws_apigatewayv2_route" "websocket_disconnect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_disconnect.id}"
}

# WebSocket $default route (for all other messages)
resource "aws_apigatewayv2_route" "websocket_default" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_message.id}"
}

# Lambda integration for $connect
resource "aws_apigatewayv2_integration" "websocket_connect" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_connect.invoke_arn
}

# Lambda integration for $disconnect
resource "aws_apigatewayv2_integration" "websocket_disconnect" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_disconnect.invoke_arn
}

# Lambda integration for $default (message handler)
resource "aws_apigatewayv2_integration" "websocket_message" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_message.invoke_arn
}

# Lambda permission for $connect
resource "aws_lambda_permission" "websocket_connect" {
  statement_id  = "AllowExecutionFromAPIGateway-Connect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

# Lambda permission for $disconnect
resource "aws_lambda_permission" "websocket_disconnect" {
  statement_id  = "AllowExecutionFromAPIGateway-Disconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

# Lambda permission for $default (message handler)
resource "aws_lambda_permission" "websocket_message" {
  statement_id  = "AllowExecutionFromAPIGateway-Message"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_message.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

