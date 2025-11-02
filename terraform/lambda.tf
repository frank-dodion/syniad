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
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.games.arn,
          "${aws_dynamodb_table.games.arn}/*"
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

data "archive_file" "authorizer_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../.build/lambda-packages/authorizer"
  output_path = "${path.module}/lambda-zips/authorizer.zip"
  
  depends_on = [null_resource.build_lambda]
  
  excludes = ["node_modules/.cache"]
}

# Build step - triggers when source files change
resource "null_resource" "build_lambda" {
  triggers = {
    handlers_hash = sha256(join("", [
      for f in fileset("${path.module}/../handlers", "**/*.ts") : filesha256("${path.module}/../handlers/${f}")
    ]))
    lib_hash = sha256(join("", [
      for f in fileset("${path.module}/../lib", "**/*.ts") : filesha256("${path.module}/../lib/${f}")
    ]))
    shared_hash = sha256(join("", [
      for f in fileset("${path.module}/../shared", "**/*.ts") : filesha256("${path.module}/../shared/${f}")
    ]))
    package_json = filesha256("${path.module}/../package.json")
  }

  provisioner "local-exec" {
    command = "cd ${path.module}/.. && bash scripts/build-lambda.sh"
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
    }
  }

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

