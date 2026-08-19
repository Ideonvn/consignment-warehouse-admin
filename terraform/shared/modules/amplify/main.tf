# Amplify Hosting for the admin portal.
#
# The build spec is NOT set here. `amplify.yml` in the repository root takes
# precedence over an app-level spec anyway, so defining both would leave two
# sources of truth with the losing one still looking authoritative in the
# console. The spec belongs beside the code it builds, where it is reviewed with
# it — see amplify.yml.
resource "aws_amplify_app" "this" {
  name       = var.app_name
  repository = var.repository_url

  # Next.js SSR. The app has server-rendered routes, so a static-only platform
  # (WEB) would 404 them at runtime rather than fail at deploy time.
  platform = "WEB_COMPUTE"

  iam_service_role_arn = aws_iam_role.amplify.arn

  access_token = var.github_access_token != "" ? var.github_access_token : null

  enable_auto_branch_creation = var.enable_auto_branch_creation
  enable_branch_auto_build    = var.enable_branch_auto_build

  # SPA-style rewrites are deliberately absent: App Router handles its own
  # routing, and a catch-all rewrite here would shadow the compute routes.
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.this.id
  branch_name = var.branch_name

  enable_auto_build = var.enable_branch_auto_build
  stage             = "PRODUCTION"

  # Set on the branch rather than the app: an app-level variable is inherited by
  # every branch, including any preview branch, which would point a preview at
  # the production API.
  environment_variables = var.branch_environment_variables
}

# Custom domain. Amplify issues and renews the certificate itself; what it cannot
# do is create the DNS records when the zone lives in another account or
# registrar. See README.md → DNS for the records to add by hand in that case.
resource "aws_amplify_domain_association" "this" {
  count = var.app_domain != "" ? 1 : 0

  app_id      = aws_amplify_app.this.id
  domain_name = local.domain_root

  # Waits for the certificate to verify. False here would report success while
  # the domain is still pending, which reads as "deployed" when it is not.
  wait_for_verification = true

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = local.domain_prefix
  }
}

locals {
  # "admin.example.co.za" -> prefix "admin", root "example.co.za". An apex domain
  # (no prefix) is supported by passing the bare zone: the prefix is then "".
  domain_parts  = var.app_domain != "" ? split(".", var.app_domain) : []
  domain_prefix = length(local.domain_parts) > 2 ? local.domain_parts[0] : ""
  domain_root   = length(local.domain_parts) > 2 ? join(".", slice(local.domain_parts, 1, length(local.domain_parts))) : var.app_domain
}

resource "aws_iam_role" "amplify" {
  name = "${var.app_name}-amplify-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { Service = "amplify.amazonaws.com" }
      }
    ]
  })
}

# What the compute runtime actually needs: writing its own logs. Everything else
# an operator does goes through the API with a bearer token, not through this
# role — the server side of this app renders shells and holds no AWS credentials
# of its own.
resource "aws_iam_role_policy" "compute" {
  name = "${var.app_name}-compute-policy"
  role = aws_iam_role.amplify.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:*:*:log-group:/aws/amplify/*"
      }
    ]
  })
}
