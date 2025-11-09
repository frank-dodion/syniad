# CloudFront Distribution - Clean Minimal Configuration
# Lambda Function URL origin with S3 static assets

# Simple cache policy - no caching
# When TTL=0, all parameters must be "none" per AWS requirements
resource "aws_cloudfront_cache_policy" "simple_no_cache" {
  name        = "${local.service_name}-simple-no-cache"
  comment     = "No caching - TTL=0"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# Simple origin request policy - forward all headers
resource "aws_cloudfront_origin_request_policy" "simple_forward_all" {
  name    = "${local.service_name}-simple-forward-all"
  comment = "Forward all headers and query strings"

  cookies_config {
    cookie_behavior = "all"
  }
  headers_config {
    header_behavior = "allViewer"
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

# CloudFront Cache Policy - long cache for static assets
resource "aws_cloudfront_cache_policy" "static_cache" {
  name        = "${local.service_name}-static-cache"
  comment     = "Long cache policy for static assets"
  default_ttl = 31536000  # 1 year
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_distribution" "frontend_new" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.service_name} - New clean distribution"

  aliases = [local.frontend_domain_name]

  # Lambda Function URL origin
  origin {
    domain_name = replace(replace(aws_lambda_function_url.game.function_url, "https://", ""), "/", "")
    origin_id   = "lambda-origin"
    
    custom_origin_config {
      http_port              = 443
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
  }

  # S3 origin for static assets
  origin {
    domain_name              = aws_s3_bucket.game_static.bucket_regional_domain_name
    origin_id                = "s3-static"
    origin_access_control_id = aws_cloudfront_origin_access_control.game_static.id
  }

  # Default behavior - Lambda (all routes)
  # Using forwarded_values like the ChatGPT example - simple and works
  default_cache_behavior {
    target_origin_id       = "lambda-origin"
    viewer_protocol_policy = "redirect-to-https"
    
    allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    # Use forwarded_values (simpler approach, no caching)
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Origin", "Accept"]
      cookies {
        forward = "all"
      }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Static assets behavior
  ordered_cache_behavior {
    path_pattern     = "/_next/static/*"
    target_origin_id = "s3-static"
    viewer_protocol_policy = "redirect-to-https"
    
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    cache_policy_id = aws_cloudfront_cache_policy.static_cache.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [
    aws_acm_certificate_validation.frontend,
    aws_lambda_function_url.game
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# Route 53 A record for frontend - pointing to new distribution
resource "aws_route53_record" "frontend" {
  name    = local.frontend_domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.main.zone_id

  alias {
    name                   = aws_cloudfront_distribution.frontend_new.domain_name
    zone_id                = aws_cloudfront_distribution.frontend_new.hosted_zone_id
    evaluate_target_health = false
  }
}

# Route 53 AAAA record for frontend (IPv6) - pointing to new distribution
resource "aws_route53_record" "frontend_ipv6" {
  name    = local.frontend_domain_name
  type    = "AAAA"
  zone_id = data.aws_route53_zone.main.zone_id

  alias {
    name                   = aws_cloudfront_distribution.frontend_new.domain_name
    zone_id                = aws_cloudfront_distribution.frontend_new.hosted_zone_id
    evaluate_target_health = false
  }
}

