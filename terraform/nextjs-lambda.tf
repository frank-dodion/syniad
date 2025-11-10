# Random UUID for Better Auth secret (generated once and stored in state)
resource "random_uuid" "better_auth_secret" {
  keepers = {
    # Regenerate if stage changes
    stage = var.stage
  }
}

# Deploy static assets to S3 for Next.js app
resource "null_resource" "deploy_static_assets" {
  triggers = {
    # Re-deploy static assets when Next.js config or build output changes
    app_config    = filesha256("${path.module}/../next.config.js")
    deploy_script = filesha256("${path.module}/../scripts/deploy-static-assets.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/deploy-static-assets.sh ${var.stage}"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }

  depends_on = [
    aws_s3_bucket.game_static
  ]
}

# Build and push Docker image for game app
resource "null_resource" "build_and_push_docker" {
  triggers = {
    app_hash = sha256(join("", concat(
      [for f in fileset("${path.module}/../app", "**/*") : filesha256("${path.module}/../app/${f}")],
      [for f in fileset("${path.module}/../components", "**/*") : filesha256("${path.module}/../components/${f}")],
      [for f in fileset("${path.module}/../lib", "**/*") : filesha256("${path.module}/../lib/${f}")],
      [for f in fileset("${path.module}/../shared", "**/*") : filesha256("${path.module}/../shared/${f}")]
    )))
    dockerfile   = filesha256("${path.module}/../Dockerfile")
    next_config  = filesha256("${path.module}/../next.config.js")
    build_script = filesha256("${path.module}/../scripts/build-and-push-nextjs-docker.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/build-and-push-nextjs-docker.sh ${var.stage}"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }

  depends_on = [
    aws_ecr_repository.game,
    null_resource.deploy_static_assets
  ]
}

# Resolve the digest for the freshly pushed :latest image so Lambda is forced to update
data "aws_ecr_image" "game_latest" {
  repository_name = aws_ecr_repository.game.name
  image_tag       = "latest"

  depends_on = [
    null_resource.build_and_push_docker
  ]
}

# Lambda Function for Game App (using container image)
# This is now the only deployable app - includes both game and scenario editor functionality
resource "aws_lambda_function" "game" {
  function_name = "${local.service_name}-game"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 60   # Increased to handle cold starts and Next.js initialization
  memory_size   = 1024 # Increased memory for faster initialization
  package_type  = "Image"

  # Use the latest image digest so Lambda is updated on every deploy
  # We still push :latest in the build script, but resolve the digest at apply time
  image_uri = "${aws_ecr_repository.game.repository_url}@${data.aws_ecr_image.game_latest.image_digest}"

  # Note: Lambda Function URLs work directly with container images - no Lambda Web Adapter layer needed

  environment {
    variables = {
      PORT     = "8080"
      HOSTNAME = "0.0.0.0"
      # Lambda Web Adapter configuration - disable readiness check
      AWS_LWA_PORT                   = "8080"
      AWS_LWA_ENABLE_READINESS_CHECK = "false"
      # Next.js environment variables
      # Note: NEXT_PUBLIC_* vars are only needed if embedded at build time
      # Since client-side code now uses window.location.origin, we don't need NEXT_PUBLIC_FRONTEND_URL
      # But keeping it for backward compatibility and any other code that might use it
      NEXT_PUBLIC_API_URL      = "https://${local.frontend_domain_name}" # API routes are now in the game app
      NEXT_PUBLIC_FRONTEND_URL = "https://${local.frontend_domain_name}" # Kept for compatibility, but client-side uses window.location.origin
      FRONTEND_URL             = "https://${local.frontend_domain_name}" # Runtime variable for server-side code
      # NEXT_PUBLIC_ASSET_PREFIX is a build-time variable, already embedded in Docker image
      # No need to set it as runtime environment variable (would create circular dependency)
      NEXTAUTH_URL          = "https://${local.frontend_domain_name}"
      BETTER_AUTH_SECRET    = random_uuid.better_auth_secret.result
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.users.id
      COGNITO_CLIENT_ID     = aws_cognito_user_pool_client.web_client.id
      COGNITO_CLIENT_SECRET = "" # Public client, no secret needed
      COGNITO_REGION        = var.aws_region
      COGNITO_DOMAIN        = "${aws_cognito_user_pool_domain.auth_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
      # DynamoDB table names for API routes
      GAMES_TABLE        = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
      SCENARIOS_TABLE    = aws_dynamodb_table.scenarios.name
      # AWS_REGION is automatically provided by Lambda - don't set it manually
    }
  }

  depends_on = [
    null_resource.build_and_push_docker
  ]

  tags = local.common_tags
}

# Lambda Function URL for Game
resource "aws_lambda_function_url" "game" {
  function_name      = aws_lambda_function.game.function_name
  authorization_type = "NONE"
  cors {
    # Note: allow_credentials cannot be true with allow_origins = ["*"]
    # Since we use Bearer token auth (not cookies), we don't need credentials
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 300
  }
}

# Resource-based policy for Lambda Function URL to allow public access
# This is required even with authorization_type = "NONE" when accessed through CloudFront
# Note: For Function URLs with authorization_type = "NONE", this permission allows any principal to invoke
# Using principal = "*" allows CloudFront (and any other service) to invoke the Function URL
resource "aws_lambda_permission" "game_function_url" {
  statement_id           = "AllowPublicInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.game.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

