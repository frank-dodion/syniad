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
    name = "player1Id"
    type = "S"
  }

  attribute {
    name = "player2Id"
    type = "S"
  }

  # GSI to query games by player1 (efficient "games created by player1" queries)
  global_secondary_index {
    name            = "player1Id-index"
    hash_key        = "player1Id"
    projection_type = "ALL" # Include all attributes in the index
  }

  # GSI to query games by player2 (efficient "games joined by player2" queries)
  global_secondary_index {
    name            = "player2Id-index"
    hash_key        = "player2Id"
    projection_type = "ALL" # Include all attributes in the index
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
    name            = "gameId-index"
    hash_key        = "gameId"
    projection_type = "ALL" # Include all attributes in the index
  }

  tags = merge(local.common_tags, {
    Name = "${local.service_name}-player-games"
  })
}

# DynamoDB Table for Scenarios
resource "aws_dynamodb_table" "scenarios" {
  name           = "${local.service_name}-scenarios"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "scenarioId"

  attribute {
    name = "scenarioId"
    type = "S"
  }

  attribute {
    name = "queryKey"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI to query all scenarios efficiently (without Scan)
  # Uses constant partition key "ALL_SCENARIOS" and sorts by createdAt
  global_secondary_index {
    name            = "queryKey-createdAt-index"
    hash_key        = "queryKey"
    range_key       = "createdAt"
    projection_type = "ALL" # Include all attributes in the index
  }

  tags = merge(local.common_tags, {
    Name = "${local.service_name}-scenarios"
  })
}

