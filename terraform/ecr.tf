# ECR Repository for Next.js Lambda container image
resource "aws_ecr_repository" "game" {
  name                 = "${local.service_name}-game"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# ECR Lifecycle Policy - keep last 10 images
resource "aws_ecr_lifecycle_policy" "game" {
  repository = aws_ecr_repository.game.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

