locals {
  service_name = "${var.project_name}-${var.stage}"
  
  # Custom domain based on stage
  # Dev: dev.api.syniad.net, Prod: api.syniad.net
  api_domain_name = var.stage == "prod" ? "api.${var.domain_name}" : "${var.stage}.api.${var.domain_name}"
  
  # Common tags
  common_tags = {
    Project     = var.project_name
    Environment = var.stage
    ManagedBy   = "Terraform"
  }
}

