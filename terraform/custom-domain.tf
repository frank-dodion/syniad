# Data source for Route 53 hosted zone
data "aws_route53_zone" "main" {
  name = var.domain_name
}

# ACM Certificate (must be in us-east-1 for API Gateway)
# Note: This certificate is created in us-east-1 regardless of var.aws_region
# Provider alias is defined in main.tf
resource "aws_acm_certificate" "api" {
  provider          = aws.us_east_1
  domain_name       = "api.${var.domain_name}"
  validation_method  = "DNS"

  subject_alternative_names = [
    "*.api.${var.domain_name}"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-api-cert"
    }
  )
}

# Certificate validation records
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# Wait for certificate validation
resource "aws_acm_certificate_validation" "api" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.api.arn
  validation_record_fqdns = [
    for record in aws_route53_record.api_cert_validation : record.fqdn
  ]
}

# API Gateway Custom Domain
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type  = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.api]

  tags = local.common_tags
}

# API Gateway Domain Mapping (maps custom domain to API stage)
resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route 53 A record pointing to API Gateway custom domain
resource "aws_route53_record" "api" {
  name    = local.api_domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.main.zone_id

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

