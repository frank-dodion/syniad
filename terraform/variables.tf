variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "stage" {
  description = "Deployment stage (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "syniad"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256
}

variable "domain_name" {
  description = "Root domain name (e.g., syniad.net)"
  type        = string
  default     = "syniad.net"
}

variable "cors_allowed_origins" {
  description = "Allowed CORS origins (comma-separated list)"
  type        = list(string)
  default     = ["*"]
}

variable "cognito_callback_urls" {
  description = "Allowed callback URLs for Cognito OAuth (e.g., https://yourdomain.com/callback)"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "cognito_logout_urls" {
  description = "Allowed logout URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

