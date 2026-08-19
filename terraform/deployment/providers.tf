terraform {
  # `use_lockfile` needs Terraform >= 1.10; it went GA in 1.11.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.82.2"
    }
  }

  # Remote state, matching the backend repo rather than the local state the
  # dependable-admin reference uses. Local state on one laptop means that if the
  # laptop goes, Terraform no longer knows this app exists and the recovery is
  # importing it by hand; it also cannot be shared, so a second person cannot
  # apply safely.
  #
  # `use_lockfile = true` is native S3 locking — a `.tflock` object beside the
  # state — so there is no DynamoDB table to create, which is what older guides
  # all reach for.
  #
  # The bucket is a chicken-and-egg and is NOT created here. See README.md.
  backend "s3" {
    bucket       = "consignment-warehouse-tfstate"
    key          = "admin-portal/terraform.tfstate"
    region       = "af-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Terraform   = true
      Project     = "ConsignmentWarehouse"
      Component   = "admin-portal"
      Environment = var.environment
    }
  }
}
