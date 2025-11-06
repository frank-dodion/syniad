# IAM Role for Lambda functions
resource "aws_iam_role" "lambda_role" {
  name = "${local.service_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# IAM Policy for Lambda to access DynamoDB
resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name = "${local.service_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          aws_dynamodb_table.games.arn,
          "${aws_dynamodb_table.games.arn}/*",
          "${aws_dynamodb_table.games.arn}/index/*",
          aws_dynamodb_table.player_games.arn,
          "${aws_dynamodb_table.player_games.arn}/*",
          "${aws_dynamodb_table.player_games.arn}/index/*",
          aws_dynamodb_table.scenarios.arn,
          "${aws_dynamodb_table.scenarios.arn}/*",
          "${aws_dynamodb_table.scenarios.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Archive Lambda function code
data "archive_file" "test_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/test"
  output_path = "${path.module}/lambda-zips/test.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "create_game_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/createGame"
  output_path = "${path.module}/lambda-zips/createGame.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "join_game_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/joinGame"
  output_path = "${path.module}/lambda-zips/joinGame.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "get_game_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/getGame"
  output_path = "${path.module}/lambda-zips/getGame.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "delete_game_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/deleteGame"
  output_path = "${path.module}/lambda-zips/deleteGame.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "get_all_games_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/getAllGames"
  output_path = "${path.module}/lambda-zips/getAllGames.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "create_scenario_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/createScenario"
  output_path = "${path.module}/lambda-zips/createScenario.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "get_scenarios_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/getScenarios"
  output_path = "${path.module}/lambda-zips/getScenarios.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "update_scenario_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/updateScenario"
  output_path = "${path.module}/lambda-zips/updateScenario.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "delete_scenario_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/deleteScenario"
  output_path = "${path.module}/lambda-zips/deleteScenario.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "authorizer_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/authorizer"
  output_path = "${path.module}/lambda-zips/authorizer.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "docs_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/docs"
  output_path = "${path.module}/lambda-zips/docs.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

data "archive_file" "auth_proxy_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/authProxy"
  output_path = "${path.module}/lambda-zips/authProxy.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

# Build step - triggers when source files change
# This builds ALL Lambda functions when any source code or configuration changes.
# To force a rebuild of all lambdas, you can:
#   1. Touch any source file: touch handlers/test.ts && terraform apply
#   2. Or manually run: ./scripts/build-lambda.sh && terraform apply
resource "null_resource" "build_lambda" {
  triggers = {
    # Source files - triggers rebuild when any handler, lib, or shared code changes
    handlers_hash = sha256(join("", [
      for f in fileset("${path.module}/../handlers", "**/*.ts") : filesha256("${path.module}/../handlers/${f}")
    ]))
    lib_hash = sha256(join("", [
      for f in fileset("${path.module}/../lib", "**/*.ts") : filesha256("${path.module}/../lib/${f}")
    ]))
    shared_hash = sha256(join("", [
      for f in fileset("${path.module}/../shared", "**/*.ts") : filesha256("${path.module}/../shared/${f}")
    ]))
    # Configuration files that affect the build
    package_json = filesha256("${path.module}/../package.json")
    package_lock_json = filesha256("${path.module}/../package-lock.json")
    tsconfig_json = filesha256("${path.module}/../tsconfig.json")
    # Build script itself - rebuilds if the build process changes
    build_script = filesha256("${path.module}/../scripts/build-lambda.sh")
    # OpenAPI spec - triggers rebuild when docs change (so /docs endpoint gets updated spec)
    openapi_spec = filesha256("${path.module}/../docs/openapi.yaml")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/.. && bash scripts/build-lambda.sh"
    on_failure  = continue
    interpreter = ["bash", "-c"]
  }
}

# Test Lambda function
resource "aws_lambda_function" "test" {
  filename         = data.archive_file.test_lambda.output_path
  function_name    = "${local.service_name}-test"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.test_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
    }
  }

  tags = local.common_tags
}

# CreateGame Lambda function
resource "aws_lambda_function" "create_game" {
  filename         = data.archive_file.create_game_lambda.output_path
  function_name    = "${local.service_name}-create-game"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.create_game_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
      SCENARIOS_TABLE = aws_dynamodb_table.scenarios.name
    }
  }

  tags = local.common_tags
}

# JoinGame Lambda function
resource "aws_lambda_function" "join_game" {
  filename         = data.archive_file.join_game_lambda.output_path
  function_name    = "${local.service_name}-join-game"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.join_game_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
    }
  }

  tags = local.common_tags
}

# GetGame Lambda function
resource "aws_lambda_function" "get_game" {
  filename         = data.archive_file.get_game_lambda.output_path
  function_name    = "${local.service_name}-get-game"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.get_game_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
    }
  }

  tags = local.common_tags
}

# DeleteGame Lambda function
resource "aws_lambda_function" "delete_game" {
  filename         = data.archive_file.delete_game_lambda.output_path
  function_name    = "${local.service_name}-delete-game"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.delete_game_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
    }
  }

  tags = local.common_tags
}

# GetAllGames Lambda function (also handles games by player via query param)
resource "aws_lambda_function" "get_all_games" {
  filename         = data.archive_file.get_all_games_lambda.output_path
  function_name    = "${local.service_name}-get-all-games"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.get_all_games_lambda.output_base64sha256

  environment {
    variables = {
      GAMES_TABLE = aws_dynamodb_table.games.name
      PLAYER_GAMES_TABLE = aws_dynamodb_table.player_games.name
    }
  }

  tags = local.common_tags
}

# CreateScenario Lambda function
resource "aws_lambda_function" "create_scenario" {
  filename         = data.archive_file.create_scenario_lambda.output_path
  function_name    = "${local.service_name}-create-scenario"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.create_scenario_lambda.output_base64sha256

  environment {
    variables = {
      SCENARIOS_TABLE = aws_dynamodb_table.scenarios.name
    }
  }

  tags = local.common_tags
}

# GetScenarios Lambda function
resource "aws_lambda_function" "get_scenarios" {
  filename         = data.archive_file.get_scenarios_lambda.output_path
  function_name    = "${local.service_name}-get-scenarios"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.get_scenarios_lambda.output_base64sha256

  environment {
    variables = {
      SCENARIOS_TABLE = aws_dynamodb_table.scenarios.name
    }
  }

  tags = local.common_tags
}

# UpdateScenario Lambda function
resource "aws_lambda_function" "update_scenario" {
  filename         = data.archive_file.update_scenario_lambda.output_path
  function_name    = "${local.service_name}-update-scenario"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.update_scenario_lambda.output_base64sha256

  environment {
    variables = {
      SCENARIOS_TABLE = aws_dynamodb_table.scenarios.name
    }
  }

  tags = local.common_tags
}

# DeleteScenario Lambda function
resource "aws_lambda_function" "delete_scenario" {
  filename         = data.archive_file.delete_scenario_lambda.output_path
  function_name    = "${local.service_name}-delete-scenario"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size
  source_code_hash = data.archive_file.delete_scenario_lambda.output_base64sha256

  environment {
    variables = {
      SCENARIOS_TABLE = aws_dynamodb_table.scenarios.name
    }
  }

  tags = local.common_tags
}

# Docs Lambda function
resource "aws_lambda_function" "docs" {
  filename         = data.archive_file.docs_lambda.output_path
  function_name    = "${local.service_name}-docs"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 128
  source_code_hash = data.archive_file.docs_lambda.output_base64sha256

  tags = local.common_tags
}

# Authorizer Lambda function
resource "aws_lambda_function" "authorizer" {
  filename         = data.archive_file.authorizer_lambda.output_path
  function_name    = "${local.service_name}-authorizer"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 5
  memory_size     = 128
  source_code_hash = data.archive_file.authorizer_lambda.output_base64sha256

  environment {
    variables = {
      USER_POOL_ID = aws_cognito_user_pool.users.id
      USER_POOL_CLIENT_ID = aws_cognito_user_pool_client.web_client.id
    }
  }

  tags = local.common_tags
}

# Auth Proxy Lambda function
resource "aws_lambda_function" "auth_proxy" {
  filename         = data.archive_file.auth_proxy_lambda.output_path
  function_name    = "${local.service_name}-auth-proxy"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 256
  source_code_hash = data.archive_file.auth_proxy_lambda.output_base64sha256

  environment {
    variables = {
      USER_POOL_ID = aws_cognito_user_pool.users.id
      USER_POOL_CLIENT_ID = aws_cognito_user_pool_client.web_client.id
      API_BASE_URL = "https://${local.api_domain_name}"
      COGNITO_DOMAIN = aws_cognito_user_pool_domain.auth_domain.domain
      COGNITO_REGION = var.aws_region
      FRONTEND_DOMAIN = local.frontend_domain_name
      EDITOR_DOMAIN = local.editor_domain_name
    }
  }

  tags = local.common_tags
}

