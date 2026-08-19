variable "app_name" {
  description = "Name of the Amplify application, also the prefix for its IAM role."
  type        = string
}

variable "repository_url" {
  description = "Repository to build from, e.g. https://github.com/your-org/consignment-warehouse-admin."
  type        = string
}

variable "github_access_token" {
  description = <<-DESC
    Personal access token, required for a private repository. Needs `repo` and
    `admin:repo_hook`. Leave empty and connect the repository by hand in the
    console if you would rather not hold a token in state — see README.md.
  DESC
  type        = string
  default     = ""
  sensitive   = true
}

variable "branch_name" {
  description = "The branch that is deployed to production."
  type        = string
  default     = "main"
}

variable "branch_environment_variables" {
  description = <<-DESC
    Environment variables for the production branch. NEXT_PUBLIC_* values are
    inlined into the client bundle at build time, so a change here needs a
    rebuild, not just a restart.
  DESC
  type        = map(string)
  default     = {}
}

variable "app_domain" {
  description = "FQDN the app is served from, e.g. admin.example.co.za. Empty means the amplifyapp.com default domain only."
  type        = string
  default     = ""
}

variable "enable_auto_branch_creation" {
  description = <<-DESC
    Build every new branch automatically. Off by default: this app talks to the
    production API, and a preview build of an unreviewed branch would be a live
    operator console pointed at real money.
  DESC
  type        = bool
  default     = false
}

variable "enable_branch_auto_build" {
  description = "Build the production branch on push."
  type        = bool
  default     = true
}
