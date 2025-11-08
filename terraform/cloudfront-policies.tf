# CloudFront Cache Policy - no caching for API routes
# When caching is disabled (TTL=0), all parameters (cookies, headers, query strings) must be "none"
resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${local.service_name}-no-cache"
  comment     = "No caching policy for API routes"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false  # Required when caching is disabled
    enable_accept_encoding_gzip   = false  # Required when caching is disabled

    cookies_config {
      cookie_behavior = "none"  # Required when caching is disabled
    }

    headers_config {
      header_behavior = "none"  # Required when caching is disabled
    }

    query_strings_config {
      query_string_behavior = "none"  # Required when caching is disabled
    }
  }
}

# CloudFront Origin Request Policy - forward all headers except Host
# CloudFront automatically sets Host to origin domain, so we don't forward the viewer's Host header
# Note: Authorization header is automatically forwarded when using "allViewer" behavior
resource "aws_cloudfront_origin_request_policy" "forward_all_except_host" {
  name    = "${local.service_name}-forward-all-except-host"
  comment = "Forward all viewer headers except Host (which CloudFront sets automatically)"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"  # Forwards all viewer headers (including Authorization)
    # CloudFront automatically sets Host to origin domain, so we don't need to whitelist it
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

