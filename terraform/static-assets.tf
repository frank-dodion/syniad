# S3 Bucket for Game App Static Assets
resource "aws_s3_bucket" "game_static" {
  bucket = "${local.service_name}-game-static"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.service_name}-game-static"
    }
  )
}

resource "aws_s3_bucket_versioning" "game_static" {
  bucket = aws_s3_bucket.game_static.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "game_static" {
  bucket = aws_s3_bucket.game_static.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Control for Game Static Assets
resource "aws_cloudfront_origin_access_control" "game_static" {
  name                              = "${local.service_name}-game-static-oac"
  description                       = "OAC for game app static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                 = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "game_static" {
  bucket = aws_s3_bucket.game_static.id
  depends_on = [
    aws_s3_bucket_public_access_block.game_static,
    aws_cloudfront_origin_access_control.game_static,
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
        Resource = "${aws_s3_bucket.game_static.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = "${aws_cloudfront_distribution.frontend_new.arn}"
          }
        }
      }
    ]
  })
}

