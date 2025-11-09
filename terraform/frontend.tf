# Frontend S3 Bucket for Static Website Hosting
resource "aws_s3_bucket" "frontend" {
  bucket = "${local.service_name}-frontend"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-frontend"
    }
  )
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Public Access Block (block public access, use CloudFront OAC instead)
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket Policy for CloudFront Origin Access Control
# Updated to use new CloudFront distribution
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  depends_on = [
    aws_s3_bucket_public_access_block.frontend,
    aws_cloudfront_origin_access_control.frontend,
    aws_cloudfront_distribution.frontend_new
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
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend_new.arn
          }
        }
      }
    ]
  })
}

# ACM Certificate for Frontend (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = local.frontend_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-frontend-cert"
    }
  )
}

# Certificate validation records for frontend
resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
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
resource "aws_acm_certificate_validation" "frontend" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [
    for record in aws_route53_record.frontend_cert_validation : record.fqdn
  ]
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.service_name}-frontend-oac"
  description                       = "OAC for frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                 = "always"
  signing_protocol                  = "sigv4"
}

# OLD CLOUDFRONT DISTRIBUTION - REMOVED (was not working)
# Replaced by aws_cloudfront_distribution.frontend_new in cloudfront-new.tf

