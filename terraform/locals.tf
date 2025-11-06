locals {
  service_name = "${var.project_name}-${var.stage}"
  
  # Custom domain based on stage
  # Dev: dev.api.syniad.net, Prod: api.syniad.net
  api_domain_name = var.stage == "prod" ? "api.${var.domain_name}" : "${var.stage}.api.${var.domain_name}"
  
  # Frontend domain based on stage
  # Dev: dev.syniad.net, Prod: syniad.net (or game.syniad.net)
  frontend_domain_name = var.stage == "prod" ? "${var.domain_name}" : "${var.stage}.${var.domain_name}"
  
  # Scenario editor domain
  # Dev: editor.dev.syniad.net, Prod: editor.syniad.net
  editor_domain_name = var.stage == "prod" ? "editor.${var.domain_name}" : "editor.${var.stage}.${var.domain_name}"
  
  # Common tags
  common_tags = {
    Project     = var.project_name
    Environment = var.stage
    ManagedBy   = "Terraform"
  }
}

