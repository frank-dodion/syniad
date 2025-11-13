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
          "${aws_dynamodb_table.scenarios.arn}/index/*",
          aws_dynamodb_table.websocket_connections.arn,
          "${aws_dynamodb_table.websocket_connections.arn}/*",
          "${aws_dynamodb_table.websocket_connections.arn}/index/*"
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
      },
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "arn:aws:execute-api:${var.aws_region}:*:*/*"
      }
    ]
  })
}

# API Lambda functions removed - API routes are now in the game app as Next.js API routes
# All API endpoints are available at:
# - https://dev.syniad.net/api/games
# - https://dev.syniad.net/api/scenarios  
# - https://dev.syniad.net/api/docs
#
# The following Lambda functions have been removed:
# - test, create_game, join_game, get_game, delete_game, get_all_games
# - create_scenario, get_scenarios, update_scenario, delete_scenario
# - docs, authorizer
#
# Authentication is now handled by Better Auth in Next.js API routes

