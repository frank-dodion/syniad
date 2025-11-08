# Cognito User Pool
resource "aws_cognito_user_pool" "users" {
  name = "${local.service_name}-users"

  username_attributes = ["email"]
  
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = local.common_tags
}

# Cognito User Pool Client (for frontend apps)
resource "aws_cognito_user_pool_client" "web_client" {
  name         = "${local.service_name}-web-client"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret = false # For public clients (web/mobile apps)

  # Allowed OAuth flows
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  # Enable admin authentication flows (for testing/script access)
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Callback URLs - include Better Auth callback URLs
  # Includes production domains and local development URLs
  callback_urls = concat(
    [
      "https://${local.frontend_domain_name}/api/auth/callback/cognito",
      "http://localhost:3000/api/auth/callback/cognito", # Local development
    ],
    var.cognito_callback_urls
  )
  logout_urls = concat(
    [
      "https://${local.frontend_domain_name}",
      "http://localhost:3000", # Local development
    ],
    var.cognito_logout_urls
  )

  supported_identity_providers = ["COGNITO"]

  # Token validity (in hours)
  id_token_validity      = 24
  access_token_validity  = 24
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# Cognito User Pool Domain (optional, for custom hosted UI)
resource "aws_cognito_user_pool_domain" "auth_domain" {
  domain       = "${local.service_name}-auth-${var.stage}"
  user_pool_id = aws_cognito_user_pool.users.id
}

