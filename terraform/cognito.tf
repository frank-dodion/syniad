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

  # Rate limiting and account lockout policies
  # These help prevent brute force attacks but can be adjusted for development
  user_pool_add_ons {
    advanced_security_mode = "OFF" # Set to "ENFORCED" or "AUDIT" for production
  }

  # PreSignUp Lambda trigger for email domain allowlist
  lambda_config {
    pre_sign_up = aws_lambda_function.cognito_presignup.arn
  }

  # Note: Cognito has default rate limits that cannot be disabled:
  # - 5 requests per second per user
  # - 5 requests per second per IP
  # These are AWS-managed and help prevent abuse
  # If you hit "too many login attempts", wait 15 minutes and try again

  tags = local.common_tags

  # Note: depends_on only includes Lambda function, not permission
  # The permission references this user pool's ARN, creating a cycle if included
  # Terraform will handle the permission creation after the user pool exists
  depends_on = [
    aws_lambda_function.cognito_presignup
  ]
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

# Build script trigger for Cognito PreSignUp Lambda
resource "null_resource" "build_cognito_presignup_lambda" {
  triggers = {
    handler    = filesha256("${path.module}/../lambda-handlers/cognito-presignup/index.js")
    package    = filesha256("${path.module}/../lambda-handlers/cognito-presignup/package.json")
  }

  provisioner "local-exec" {
    command     = "cd ${path.module}/../lambda-handlers/cognito-presignup && npm install --production 2>&1 || echo 'No dependencies to install'"
    interpreter = ["bash", "-c"]
  }
}

# Archive file for Cognito PreSignUp Lambda
data "archive_file" "cognito_presignup_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-handlers/cognito-presignup"
  output_path = "${path.module}/../lambda-handlers/cognito-presignup.zip"
  excludes    = ["node_modules/.cache"]
  
  depends_on = [null_resource.build_cognito_presignup_lambda]
}

# Lambda function for Cognito PreSignUp trigger
resource "aws_lambda_function" "cognito_presignup" {
  function_name = "${local.service_name}-cognito-presignup"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.cognito_presignup_zip.output_path
  source_code_hash = data.archive_file.cognito_presignup_zip.output_base64sha256

  environment {
    variables = {
      ALLOWED_DOMAINS = join(",", var.cognito_allowed_domains)
      ALLOWED_EMAILS  = join(",", var.cognito_allowed_emails)
    }
  }

  tags = local.common_tags
}

# Lambda permission for Cognito to invoke PreSignUp trigger
resource "aws_lambda_permission" "cognito_presignup" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_presignup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.users.arn
}

