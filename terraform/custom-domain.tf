# Data source for Route 53 hosted zone
data "aws_route53_zone" "main" {
  name = var.domain_name
}

# API Gateway custom domain removed - API routes are now in the game app
# No longer need separate API Gateway certificate or domain

