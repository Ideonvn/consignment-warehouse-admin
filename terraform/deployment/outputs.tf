output "app_id" {
  description = "Amplify app id."
  value       = module.admin_portal.app_id
}

output "app_url" {
  description = "Where the portal is served from."
  value       = module.admin_portal.app_url
}

output "default_domain" {
  description = "The amplifyapp.com domain, useful before DNS is cut over."
  value       = module.admin_portal.default_domain
}

output "cors_origin_for_api" {
  description = <<-DESC
    Paste this verbatim into the API's CORS_ALLOWED_ORIGINS and into
    `cors_allowed_origins` in the backend's Terraform. The allowlist is matched
    literally and is never a wildcard, so a trailing slash or a scheme mismatch
    fails every preflight with a bare 400 and no CORS headers — which the browser
    reports as an indistinguishable network error.
  DESC
  value       = module.admin_portal.app_url
}

output "domain_certificate_records" {
  description = "DNS records to add by hand when the zone is managed elsewhere."
  value       = module.admin_portal.domain_certificate_records
}
