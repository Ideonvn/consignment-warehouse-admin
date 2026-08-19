module "admin_portal" {
  source = "../shared/modules/amplify"

  app_name            = var.app_name
  repository_url      = var.repository_url
  github_access_token = var.github_access_token
  branch_name         = var.branch_name
  app_domain          = var.app_domain

  # Set on the branch, not the app, so a preview branch can never inherit the
  # production API. Both are NEXT_PUBLIC_*, so they are inlined into the client
  # bundle at build time — changing either needs a rebuild, not a restart.
  branch_environment_variables = {
    NEXT_PUBLIC_API_BASE_URL = var.api_base_url
    NEXT_PUBLIC_WS_URL       = var.ws_url
  }

  # Off: a preview build of an unreviewed branch would be a working operator
  # console pointed at real money.
  enable_auto_branch_creation = false
  enable_branch_auto_build    = true
}
