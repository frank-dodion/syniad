# AWS Lambda Web Adapter Layer
# Using the official AWS Lambda Web Adapter layer (X86_64 architecture)
# Layer ARN format: arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerX86:${version}
# Version 21 is a recent stable version (as of 2024)
locals {
  web_adapter_layer_arn = "arn:aws:lambda:${var.aws_region}:753240598075:layer:LambdaAdapterLayerX86:21"
}

# Data source for Next.js scenario-editor package
data "archive_file" "scenario_editor_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-packages/scenario-editor"
  output_path = "${path.module}/../lambda-packages/scenario-editor.zip"
  depends_on  = [null_resource.build_nextjs]
}

# Data source for Next.js game package
data "archive_file" "game_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-packages/game"
  output_path = "${path.module}/../lambda-packages/game.zip"
  depends_on  = [null_resource.build_nextjs]
}

# Build trigger for Next.js apps
resource "null_resource" "build_nextjs" {
  triggers = {
    scenario_editor_hash = sha256(join("", [
      for f in fileset("${path.module}/../frontend/scenario-editor", "**/*") : filesha256("${path.module}/../frontend/scenario-editor/${f}")
    ]))
    game_hash = sha256(join("", [
      for f in fileset("${path.module}/../frontend/game", "**/*") : filesha256("${path.module}/../frontend/game/${f}")
    ]))
    build_script = filesha256("${path.module}/../scripts/build-nextjs.sh")
    package_script = filesha256("${path.module}/../scripts/package-nextjs-lambda.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/build-nextjs.sh && bash scripts/package-nextjs-lambda.sh"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }
}

# Lambda Function for Scenario Editor
resource "aws_lambda_function" "scenario_editor" {
  filename         = data.archive_file.scenario_editor_lambda.output_path
  function_name    = "${local.service_name}-scenario-editor"
  role            = aws_iam_role.lambda_role.arn
  handler         = "bootstrap"
  runtime         = "provided.al2023"
  timeout         = 30
  memory_size     = 512
  source_code_hash = data.archive_file.scenario_editor_lambda.output_base64sha256

  layers = [local.web_adapter_layer_arn]

  environment {
    variables = {
      PORT                    = "8080"
      NEXT_PUBLIC_API_URL     = "https://${local.api_domain_name}"
      NEXT_PUBLIC_FRONTEND_URL = "https://${local.editor_domain_name}"
      AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
      NEXTAUTH_URL            = "https://${local.editor_domain_name}"
      BETTER_AUTH_SECRET      = "change-me-in-production-min-32-chars" # TODO: Use secrets manager
      COGNITO_USER_POOL_ID    = aws_cognito_user_pool.users.id
      COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.web_client.id
      COGNITO_CLIENT_SECRET   = "" # Public client, no secret needed
      COGNITO_REGION          = var.aws_region
      COGNITO_DOMAIN          = "${aws_cognito_user_pool_domain.auth_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
    }
  }

  tags = local.common_tags
}

# Lambda Function for Game App
resource "aws_lambda_function" "game" {
  filename         = data.archive_file.game_lambda.output_path
  function_name    = "${local.service_name}-game"
  role            = aws_iam_role.lambda_role.arn
  handler         = "bootstrap"
  runtime         = "provided.al2023"
  timeout         = 30
  memory_size     = 512
  source_code_hash = data.archive_file.game_lambda.output_base64sha256

  layers = [local.web_adapter_layer_arn]

  environment {
    variables = {
      PORT                    = "8080"
      NEXT_PUBLIC_API_URL     = "https://${local.api_domain_name}"
      NEXT_PUBLIC_FRONTEND_URL = "https://${local.frontend_domain_name}"
      AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
      NEXTAUTH_URL            = "https://${local.frontend_domain_name}"
      NEXTAUTH_SECRET         = "change-me-in-production" # TODO: Use secrets manager
      COGNITO_USER_POOL_ID    = aws_cognito_user_pool.users.id
      COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.web_client.id
      COGNITO_REGION          = var.aws_region
      COGNITO_DOMAIN          = "${aws_cognito_user_pool_domain.auth_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
    }
  }

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

