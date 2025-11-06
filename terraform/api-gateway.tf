# API Gateway REST API
resource "aws_apigatewayv2_api" "api" {
  name          = "${local.service_name}-api"
  protocol_type = "HTTP"
  description   = "Syniad API"

  cors_configuration {
    # Include frontend and editor domains in allowed origins
    allow_origins = concat(
      var.cors_allowed_origins,
      ["https://${local.frontend_domain_name}", "https://${local.editor_domain_name}", "http://localhost:3000", "http://localhost:8080"]
    )
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

# API Gateway Integration for GetAllGames
resource "aws_apigatewayv2_integration" "get_all_games" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_all_games.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for CreateScenario
resource "aws_apigatewayv2_integration" "create_scenario" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.create_scenario.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for GetScenarios
resource "aws_apigatewayv2_integration" "get_scenarios" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.get_scenarios.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for UpdateScenario
resource "aws_apigatewayv2_integration" "update_scenario" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.update_scenario.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for DeleteScenario
resource "aws_apigatewayv2_integration" "delete_scenario" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.delete_scenario.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for Docs
resource "aws_apigatewayv2_integration" "docs" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.docs.invoke_arn
  integration_method = "POST"
}

# API Gateway Integration for Auth Proxy
resource "aws_apigatewayv2_integration" "auth_proxy" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.auth_proxy.invoke_arn
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
  # Disable caching to debug 403 issues (set to 0 to disable, default is 300)
  authorizer_result_ttl_in_seconds = 0  # No caching - every request goes through authorizer
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

# API Gateway Integration for DeleteGame
resource "aws_apigatewayv2_integration" "delete_game" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.delete_game.invoke_arn
  integration_method = "POST"
}

# API Gateway Route for DeleteGame
resource "aws_apigatewayv2_route" "delete_game" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "DELETE /games/{gameId}"
  target    = "integrations/${aws_apigatewayv2_integration.delete_game.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for CreateScenario
resource "aws_apigatewayv2_route" "create_scenario" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /scenarios"
  target    = "integrations/${aws_apigatewayv2_integration.create_scenario.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetScenarios (all scenarios)
resource "aws_apigatewayv2_route" "get_scenarios" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /scenarios"
  target    = "integrations/${aws_apigatewayv2_integration.get_scenarios.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetScenario (single scenario by ID)
resource "aws_apigatewayv2_route" "get_scenario" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.get_scenarios.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for UpdateScenario
resource "aws_apigatewayv2_route" "update_scenario" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "PUT /scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.update_scenario.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for DeleteScenario
resource "aws_apigatewayv2_route" "delete_scenario" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "DELETE /scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.delete_scenario.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetMyGames (games for authenticated user)
resource "aws_apigatewayv2_route" "get_my_games" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/my"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetMyGamesAsPlayer1 (games where authenticated user is player1)
resource "aws_apigatewayv2_route" "get_my_games_player1" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/my/player1"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetMyGamesAsPlayer2 (games where authenticated user is player2)
resource "aws_apigatewayv2_route" "get_my_games_player2" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/my/player2"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetAllGames (all games, with pagination query params)
resource "aws_apigatewayv2_route" "get_all_games" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetGamesByPlayer (games where player is player1 OR player2)
resource "aws_apigatewayv2_route" "get_games_by_player" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/players/{playerId}"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetGamesByPlayer1 (games where player is player1)
resource "aws_apigatewayv2_route" "get_games_by_player1" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/player1/{player1Id}"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for GetGamesByPlayer2 (games where player is player2)
resource "aws_apigatewayv2_route" "get_games_by_player2" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /games/player2/{player2Id}"
  target    = "integrations/${aws_apigatewayv2_integration.get_all_games.id}"
  authorizer_id = aws_apigatewayv2_authorizer.api_authorizer.id
  authorization_type = "CUSTOM"
}

# API Gateway Route for Docs (Swagger UI)
resource "aws_apigatewayv2_route" "docs" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /docs"
  target    = "integrations/${aws_apigatewayv2_integration.docs.id}"
  # Docs endpoint doesn't require authentication
  authorization_type = "NONE"
}

# API Gateway Route for OpenAPI Spec
resource "aws_apigatewayv2_route" "docs_openapi" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /docs/openapi.yaml"
  target    = "integrations/${aws_apigatewayv2_integration.docs.id}"
  # OpenAPI spec endpoint doesn't require authentication
  authorization_type = "NONE"
}

# API Gateway Route for Auth Proxy - Login
resource "aws_apigatewayv2_route" "auth_proxy_login" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/auth/login"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

# API Gateway Route for Auth Proxy - Callback
resource "aws_apigatewayv2_route" "auth_proxy_callback" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/auth/callback"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

# API Gateway Route for Auth Proxy - Logout
resource "aws_apigatewayv2_route" "auth_proxy_logout" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api-proxy/auth/logout"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

# API Gateway Route for Auth Proxy - Me (get current user)
resource "aws_apigatewayv2_route" "auth_proxy_me" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/auth/me"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

# API Gateway Route for Auth Proxy - Catch-all for API requests
# Note: API Gateway HTTP API doesn't support true wildcards, so we'll add common routes
# For other routes, we can add them as needed or use a $default route
resource "aws_apigatewayv2_route" "auth_proxy_scenarios" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/scenarios"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_scenarios_post" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api-proxy/scenarios"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_scenario_get" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_scenario_put" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "PUT /api-proxy/scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_scenario_delete" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "DELETE /api-proxy/scenarios/{scenarioId}"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_games" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/games"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_games_post" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api-proxy/games"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_game_get" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/games/{gameId}"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_game_join" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api-proxy/games/{gameId}/join"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_game_delete" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "DELETE /api-proxy/games/{gameId}"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_my_games" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/games/my"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_my_games_player1" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/games/my/player1"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "auth_proxy_my_games_player2" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api-proxy/games/my/player2"
  target    = "integrations/${aws_apigatewayv2_integration.auth_proxy.id}"
  authorization_type = "NONE"
}

# API Gateway Stage
# auto_deploy = true ensures changes are automatically deployed when routes/integrations change
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = var.stage
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 50
  }

  # Ensure routes are created before stage deployment
  depends_on = [
    aws_apigatewayv2_route.test,
    aws_apigatewayv2_route.create_scenario,
    aws_apigatewayv2_route.get_scenarios,
    aws_apigatewayv2_route.get_scenario,
    aws_apigatewayv2_route.update_scenario,
    aws_apigatewayv2_route.delete_scenario,
    aws_apigatewayv2_route.create_game,
    aws_apigatewayv2_route.join_game,
    aws_apigatewayv2_route.get_game,
    aws_apigatewayv2_route.delete_game,
    aws_apigatewayv2_route.get_my_games,
    aws_apigatewayv2_route.get_my_games_player1,
    aws_apigatewayv2_route.get_my_games_player2,
    aws_apigatewayv2_route.get_all_games,
    aws_apigatewayv2_route.get_games_by_player,
    aws_apigatewayv2_route.get_games_by_player1,
    aws_apigatewayv2_route.get_games_by_player2,
    aws_apigatewayv2_route.docs,
    aws_apigatewayv2_route.docs_openapi,
    aws_apigatewayv2_route.auth_proxy_login,
    aws_apigatewayv2_route.auth_proxy_callback,
    aws_apigatewayv2_route.auth_proxy_logout,
    aws_apigatewayv2_route.auth_proxy_scenarios,
    aws_apigatewayv2_route.auth_proxy_scenarios_post,
    aws_apigatewayv2_route.auth_proxy_scenario_get,
    aws_apigatewayv2_route.auth_proxy_scenario_put,
    aws_apigatewayv2_route.auth_proxy_scenario_delete,
    aws_apigatewayv2_route.auth_proxy_games,
    aws_apigatewayv2_route.auth_proxy_games_post,
    aws_apigatewayv2_route.auth_proxy_game_get,
    aws_apigatewayv2_route.auth_proxy_game_join,
    aws_apigatewayv2_route.auth_proxy_game_delete,
    aws_apigatewayv2_route.auth_proxy_my_games,
    aws_apigatewayv2_route.auth_proxy_my_games_player1,
    aws_apigatewayv2_route.auth_proxy_my_games_player2,
    aws_apigatewayv2_authorizer.api_authorizer
  ]

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

resource "aws_lambda_permission" "delete_game_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_game.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "create_scenario_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_scenario.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_scenarios_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_scenarios.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_scenario_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_scenario.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_scenario_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_scenario.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_all_games_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_all_games.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "docs_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.docs.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "auth_proxy_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_proxy.function_name
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

