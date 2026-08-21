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

  # Null rather than "" when unset, so the attribute is simply not sent. The
  # recommended path leaves this empty and connects the repository once in the
  # console — see terraform/README.md → Connecting the private repository.
  access_token = var.github_access_token != "" ? var.github_access_token : null

  enable_auto_branch_creation = var.enable_auto_branch_creation
  enable_branch_auto_build    = var.enable_branch_auto_build

  # There is deliberately NO `lifecycle { ignore_changes = [...] }` here, and it
  # should not be added:
  #
  #   - `access_token` / `oauth_token` cannot drift. The AWS API never returns
  #     them ("The token is not stored" — provider docs for both attributes), so
  #     there is nothing for Terraform to compare against and nothing to ignore.
  #   - `repository` can drift, and that is exactly the drift worth seeing.
  #     Ignoring it would let the app be repointed at a different repository
  #     without a plan ever saying so — which on this app means another codebase
  #     silently deployed to the operators' origin.
  #
  # The half-connected app the token-less path can produce is avoided by
  # sequencing, not by hiding the attribute: connect in the console, then
  # import. See terraform/README.md.

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

# Custom domain.
#
# The hosted zone for consignment-warehouse.com is a Route 53 zone in this same
# AWS account, so Amplify does the DNS itself: it creates the certificate
# verification record and the domain records, and renews the certificate. There
# is nothing to paste anywhere, and deliberately no aws_route53_record here —
# two things managing the same record set is how a domain ends up half-cut-over.
#
# (Amplify's own docs bear this out: the Route 53 procedure ends at "Choose Add
# domain" with no DNS step, while the third-party procedure says "you must
# update your DNS records with your third-party domain provider" after Amplify
# "detects that you are not using a Route 53 domain". See terraform/README.md.)
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
  # "admin.consignment-warehouse.com" -> prefix "admin", root
  # "consignment-warehouse.com". Verified with `terraform console` against the
  # real value rather than reasoned about: 3 parts, prefix "admin", root
  # "consignment-warehouse.com".
  #
  # A bare apex is supported by passing the zone itself: 2 parts means prefix ""
  # and root unchanged, which is what Amplify wants for an apex association.
  #
  # KNOWN LIMIT of the `> 2` test: it counts labels, so it cannot tell a
  # subdomain from an apex on a multi-level public suffix. "example.co.za" is
  # also 3 parts and comes out as prefix "example", root "co.za" — a public
  # suffix nobody can own. It is right for every shape this repo uses
  # (admin.consignment-warehouse.com, and the apex it will never set here), and
  # wrong for an apex like "example.co.za" or "example.com.au". Anyone pointing
  # this at such a domain must split it explicitly instead of extending the
  # count test, which cannot be made correct without a public-suffix list.
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
