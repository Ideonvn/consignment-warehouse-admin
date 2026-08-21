variable "aws_region" {
  description = <<-DESC
    Where the Amplify app is hosted.

    NOT af-south-1: Amplify Hosting is not offered there, and the API it talks to
    being in Cape Town does not change where this can run. eu-west-1 is the
    closest well-connected supported region — the west-coast cables out of South
    Africa land in Europe, so Ireland is a shorter round trip from Johannesburg
    than the US regions and about the same as Frankfurt.

    It matters less than it looks: static assets are served from CloudFront
    edges, including Johannesburg and Cape Town, and every API and WebSocket
    call goes from the browser straight to af-south-1 without passing through
    Amplify. Only a hard load of a server-rendered route crosses regions — see
    README.md → Rendering.
  DESC
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Environment tag applied to every resource."
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Amplify app name."
  type        = string
  default     = "consignment-warehouse-admin"
}

variable "repository_url" {
  description = "Repository Amplify builds from, e.g. https://github.com/Ideonvn/consignment-warehouse-admin."
  type        = string
}

variable "github_access_token" {
  description = "GitHub PAT with `repo` and `admin:repo_hook`. Empty if the repository is connected by hand."
  type        = string
  default     = ""
  sensitive   = true
}

variable "branch_name" {
  description = "Branch deployed to production."
  type        = string
  default     = "main"
}

variable "app_domain" {
  description = <<-DESC
    FQDN for the portal: admin.consignment-warehouse.com. Whatever this resolves
    to must appear verbatim in the API's CORS_ALLOWED_ORIGINS as https://<domain>,
    which for this value it already does.
  DESC
  type        = string
  default     = ""
}

variable "api_base_url" {
  description = <<-DESC
    Production REST base, no trailing slash:
    https://api.consignment-warehouse.com/api/v1. Inlined into the client bundle
    at build time.
  DESC
  type        = string
}

variable "ws_url" {
  description = <<-DESC
    Production WebSocket endpoint: wss://api.consignment-warehouse.com/api/v1/ws.
    Same host as the API — `wss`, not `ws`: a plain-ws connection from an https
    page is blocked as mixed content.
  DESC
  type        = string

  validation {
    condition     = startswith(var.ws_url, "wss://")
    error_message = "The WebSocket URL must use wss:// — an https page cannot open an insecure socket."
  }
}
