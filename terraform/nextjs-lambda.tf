# Random UUID for Better Auth secret (generated once and stored in state)
resource "random_uuid" "better_auth_secret" {
  keepers = {
    # Regenerate if stage changes
    stage = var.stage
  }
}

# Deploy static assets to S3 for Next.js apps
resource "null_resource" "deploy_static_assets" {
  triggers = {
    # Re-deploy static assets when Next.js config or build output changes
    scenario_editor_config = filesha256("${path.module}/../frontend/scenario-editor/next.config.js")
    game_config = filesha256("${path.module}/../frontend/game/next.config.js")
    deploy_script = filesha256("${path.module}/../scripts/deploy-static-assets.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/deploy-static-assets.sh ${var.stage} both"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }

  depends_on = [
    aws_s3_bucket.scenario_editor_static,
    aws_s3_bucket.game_static
  ]
}

# Build and push Docker images for Next.js apps
resource "null_resource" "build_and_push_docker" {
  triggers = {
    scenario_editor_hash = sha256(join("", [
      for f in fileset("${path.module}/../frontend/scenario-editor", "**/*") : filesha256("${path.module}/../frontend/scenario-editor/${f}")
    ]))
    game_hash = sha256(join("", [
      for f in fileset("${path.module}/../frontend/game", "**/*") : filesha256("${path.module}/../frontend/game/${f}")
    ]))
    dockerfile_scenario_editor = filesha256("${path.module}/../frontend/scenario-editor/Dockerfile")
    dockerfile_game = filesha256("${path.module}/../frontend/game/Dockerfile")
    build_script = filesha256("${path.module}/../scripts/build-and-push-nextjs-docker.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/build-and-push-nextjs-docker.sh"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }

  depends_on = [
    aws_ecr_repository.scenario_editor,
    aws_ecr_repository.game,
    null_resource.deploy_static_assets
  ]
}

# Lambda Function for Scenario Editor (using container image)
resource "aws_lambda_function" "scenario_editor" {
  function_name = "${local.service_name}-scenario-editor"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 30
  memory_size   = 512
  package_type  = "Image"
  
  image_uri = "${aws_ecr_repository.scenario_editor.repository_url}:latest"
  
  # Note: Lambda Function URLs work directly with container images - no Lambda Web Adapter layer needed

  environment {
    variables = {
      PORT                    = "8080"
      NEXT_PUBLIC_API_URL     = "https://${local.frontend_domain_name}" # API routes are now in the game app
      NEXT_PUBLIC_FRONTEND_URL = "https://${local.editor_domain_name}"
      # NEXT_PUBLIC_ASSET_PREFIX is a build-time variable, already embedded in Docker image
      # No need to set it as runtime environment variable (would create circular dependency)
      NEXTAUTH_URL            = "https://${local.editor_domain_name}"
      BETTER_AUTH_SECRET      = random_uuid.better_auth_secret.result
      COGNITO_USER_POOL_ID    = aws_cognito_user_pool.users.id
      COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.web_client.id
      COGNITO_CLIENT_SECRET   = "" # Public client, no secret needed
      COGNITO_REGION          = var.aws_region
      COGNITO_DOMAIN          = "${aws_cognito_user_pool_domain.auth_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
    }
  }

  depends_on = [
    null_resource.build_and_push_docker
  ]

  tags = local.common_tags
}

# Lambda Function for Game App (using container image)
resource "aws_lambda_function" "game" {
  function_name = "${local.service_name}-game"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 30
  memory_size   = 512
  package_type  = "Image"
  
  image_uri = "${aws_ecr_repository.game.repository_url}:latest"
  
  # Note: Lambda Function URLs work directly with container images - no Lambda Web Adapter layer needed

  environment {
    variables = {
      PORT                    = "8080"
      NEXT_PUBLIC_API_URL     = "https://${local.frontend_domain_name}" # API routes are now in the game app
      NEXT_PUBLIC_FRONTEND_URL = "https://${local.frontend_domain_name}"
      # NEXT_PUBLIC_ASSET_PREFIX is a build-time variable, already embedded in Docker image
      # No need to set it as runtime environment variable (would create circular dependency)
      NEXTAUTH_URL            = "https://${local.frontend_domain_name}"
      BETTER_AUTH_SECRET      = random_uuid.better_auth_secret.result
      COGNITO_USER_POOL_ID    = aws_cognito_user_pool.users.id
      COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.web_client.id
      COGNITO_CLIENT_SECRET   = "" # Public client, no secret needed
      COGNITO_REGION          = var.aws_region
      COGNITO_DOMAIN          = "${aws_cognito_user_pool_domain.auth_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
      # DynamoDB table names for API routes
      GAMES_TABLE             = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE      = aws_dynamodb_table.player_games.name
      SCENARIOS_TABLE         = aws_dynamodb_table.scenarios.name
      AWS_REGION              = var.aws_region
    }
  }

  depends_on = [
    null_resource.build_and_push_docker
  ]

  tags = local.common_tags
}

# Lambda Function URL for Scenario Editor
resource "aws_lambda_function_url" "scenario_editor" {
  function_name      = aws_lambda_function.scenario_editor.function_name
  authorization_type = "NONE"
  cors {
    allow_credentials = true
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 300
  }
}

# Lambda Function URL for Game
resource "aws_lambda_function_url" "game" {
  function_name      = aws_lambda_function.game.function_name
  authorization_type = "NONE"
  cors {
    allow_credentials = true
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 300
  }
}

