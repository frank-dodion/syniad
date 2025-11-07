# Scenario Editor S3 Bucket
resource "aws_s3_bucket" "scenario_editor" {
  bucket = "${local.service_name}-scenario-editor"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-scenario-editor"
    }
  )
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "scenario_editor" {
  bucket = aws_s3_bucket.scenario_editor.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "scenario_editor" {
  bucket = aws_s3_bucket.scenario_editor.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Control for Scenario Editor
resource "aws_cloudfront_origin_access_control" "scenario_editor" {
  name                              = "${local.service_name}-scenario-editor-oac"
  description                       = "OAC for scenario editor S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                 = "always"
  signing_protocol                  = "sigv4"
}

# ACM Certificate for Scenario Editor (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "scenario_editor" {
  provider          = aws.us_east_1
  domain_name       = local.editor_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-scenario-editor-cert"
    }
  )
}

# Certificate validation records for scenario editor
resource "aws_route53_record" "scenario_editor_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.scenario_editor.domain_validation_options : dvo.domain_name => {
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
resource "aws_acm_certificate_validation" "scenario_editor" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.scenario_editor.arn
  validation_record_fqdns = [
    for record in aws_route53_record.scenario_editor_cert_validation : record.fqdn
  ]
}

# CloudFront Distribution for Scenario Editor
resource "aws_cloudfront_distribution" "scenario_editor" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.service_name} scenario editor distribution"

  aliases = [local.editor_domain_name]

  # Lambda Function URL origin (primary - for HTML/API routes)
  origin {
    domain_name = replace(replace(aws_lambda_function_url.scenario_editor.function_url, "https://", ""), "/", "")
    origin_id   = "Lambda-ScenarioEditor"
    custom_origin_config {
      http_port              = 443
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # S3 origin for static assets
  origin {
    domain_name              = aws_s3_bucket.scenario_editor_static.bucket_regional_domain_name
    origin_id                = "S3-Static-${aws_s3_bucket.scenario_editor_static.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.scenario_editor_static.id
  }

  # Default behavior - Lambda origin (HTML/API routes)
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "Lambda-ScenarioEditor"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern     = "/_next/static/*"
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]
    target_origin_id = "S3-Static-${aws_s3_bucket.scenario_editor_static.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 31536000  # 1 year
    max_ttl                = 31536000
    compress               = true
  }

  # Custom error response for 403/404 - serve index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 300
  }
  
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
    error_caching_min_ttl = 300
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.scenario_editor.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [
    aws_acm_certificate_validation.scenario_editor
  ]

  tags = local.common_tags
}

# S3 Bucket Policy for Scenario Editor CloudFront OAC
resource "aws_s3_bucket_policy" "scenario_editor" {
  bucket = aws_s3_bucket.scenario_editor.id
  depends_on = [
    aws_s3_bucket_public_access_block.scenario_editor,
    aws_cloudfront_origin_access_control.scenario_editor,
    aws_cloudfront_distribution.scenario_editor
  ]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.scenario_editor.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.scenario_editor.arn
          }
        }
      }
    ]
  })
}

# Route 53 A record for scenario editor
resource "aws_route53_record" "scenario_editor" {
  name    = local.editor_domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.main.zone_id

  alias {
    name                   = aws_cloudfront_distribution.scenario_editor.domain_name
    zone_id                = aws_cloudfront_distribution.scenario_editor.hosted_zone_id
    evaluate_target_health = false
  }
}

# Route 53 AAAA record for scenario editor (IPv6)
resource "aws_route53_record" "scenario_editor_ipv6" {
  name    = local.editor_domain_name
  type    = "AAAA"
  zone_id = data.aws_route53_zone.main.zone_id

  alias {
    name                   = aws_cloudfront_distribution.scenario_editor.domain_name
    zone_id                = aws_cloudfront_distribution.scenario_editor.hosted_zone_id
    evaluate_target_health = false
  }
}

