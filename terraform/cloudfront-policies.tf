# CloudFront Cache Policy - no caching for API routes
resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${local.service_name}-no-cache"
  comment     = "No caching policy for API routes"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "all"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "CloudFront-Forwarded-Proto", "CloudFront-Is-Desktop-Viewer", "CloudFront-Is-Mobile-Viewer", "CloudFront-Is-SmartTV-Viewer", "CloudFront-Is-Tablet-Viewer", "CloudFront-Viewer-Country"]
      }
    }

    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

# CloudFront Origin Request Policy - forward all headers except Host
# CloudFront automatically sets Host to origin domain, so we don't forward the viewer's Host header
resource "aws_cloudfront_origin_request_policy" "forward_all_except_host" {
  name    = "${local.service_name}-forward-all-except-host"
  comment = "Forward all headers except Host (which CloudFront sets automatically)"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Authorization", "CloudFront-Forwarded-Proto", "CloudFront-Is-Desktop-Viewer", "CloudFront-Is-Mobile-Viewer", "CloudFront-Is-SmartTV-Viewer", "CloudFront-Is-Tablet-Viewer", "CloudFront-Viewer-Country"]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

