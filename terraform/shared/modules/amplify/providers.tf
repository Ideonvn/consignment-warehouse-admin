terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.82.2"
    }
  }
}

# No `provider` block here, deliberately, and this is the one place the module
# departs from the reference in dependable-admin. A module that declares its own
# provider cannot be cleanly removed from state: `terraform destroy` and
# `terraform state rm` both need the provider to still be configured, so the
# module has to be kept around purely to delete what it made. Providers are
# configured once in the root and inherited.
