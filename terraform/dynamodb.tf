# DynamoDB Table for Games
resource "aws_dynamodb_table" "games" {
  name           = "${local.service_name}-games"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "gameId"

  attribute {
    name = "gameId"
    type = "S"
  }

  attribute {
    name = "creatorId"
    type = "S"
  }

  # GSI to query games by creator (efficient "games created by user" queries)
  global_secondary_index {
    name     = "creatorId-index"
    hash_key = "creatorId"
  }

  tags = merge(local.common_tags, {
    Name = "${local.service_name}-games"
  })
}

# Player-Games Mapping Table
# Stores player-game relationships for efficient querying by playerId
# Composite key: playerId (PK) + gameId (SK)
# Stores playerIndex for efficient filtering (Player 1 = creator, Player 2+ = joiners)
resource "aws_dynamodb_table" "player_games" {
  name           = "${local.service_name}-player-games"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "playerId"
  range_key      = "gameId"

  attribute {
    name = "playerId"
    type = "S"
  }

  attribute {
    name = "gameId"
    type = "S"
  }

  # GSI to query players by gameId (reverse lookup: which players are in a game)
  # Can also filter by playerIndex to get only creators (playerIndex = 1) or joiners (playerIndex > 1)
  global_secondary_index {
    name     = "gameId-index"
    hash_key = "gameId"
  }

  tags = merge(local.common_tags, {
    Name = "${local.service_name}-player-games"
  })
}

