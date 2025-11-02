# DynamoDB Table for Games
resource "aws_dynamodb_table" "games" {
  name           = "${local.service_name}-games"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "gameId"

  attribute {
    name = "gameId"
    type = "S"
  }

  tags = merge(local.common_tags, {
    Name = "${local.service_name}-games"
  })
}

