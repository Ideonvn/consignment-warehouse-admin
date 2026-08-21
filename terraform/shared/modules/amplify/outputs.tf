output "app_id" {
  description = "Amplify app id, used by the console and the CLI."
  value       = aws_amplify_app.this.id
}

output "default_domain" {
  description = "The amplifyapp.com domain Amplify assigns."
  value       = aws_amplify_app.this.default_domain
}

output "app_url" {
  description = <<-DESC
    The origin the portal is served from. This is the exact string that must
    appear in the API's CORS_ALLOWED_ORIGINS — scheme and host, no trailing
    slash — because that allowlist is matched literally and never wildcarded.
  DESC
  value       = var.app_domain != "" ? "https://${var.app_domain}" : "https://${var.branch_name}.${aws_amplify_app.this.default_domain}"
}

output "branch_name" {
  description = "The deployed branch."
  value       = aws_amplify_branch.main.branch_name
}

output "iam_role_arn" {
  description = "ARN of the role the compute runtime assumes."
  value       = aws_iam_role.amplify.arn
}

output "domain_certificate_records" {
  description = <<-DESC
    INFORMATIONAL — not a to-do list. The certificate verification record Amplify
    is using.

    The hosted zone for this domain is in the same AWS account as the app, so
    Amplify creates and manages this record itself, along with the domain
    records. Nobody needs to create it. It is exposed only for diagnosing a
    domain association stuck in PENDING_VERIFICATION, where seeing what Amplify
    expects is useful.

    Do NOT hand-create what this prints, and do not add aws_route53_record
    resources for it: a duplicate record fights Amplify for control of the zone,
    and ACM cannot renew the certificate if the verification record it owns is
    modified. Empty when no custom domain is configured.
  DESC
  value       = var.app_domain != "" ? aws_amplify_domain_association.this[0].certificate_verification_dns_record : null
}
