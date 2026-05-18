variable "environment" {
  description = "Environment name (dev, staging, production, org). Injected via terragrunt env.hcl."
  type        = string
}

variable "region" {
  description = "AWS region. Injected via terragrunt region.hcl."
  type        = string
}

variable "tenants" {
  description = "Map of tenant_id → tenant configuration. Empty map for single-tenant components."
  type = map(object({
    # Add tenant-specific fields here. Common ones from other multitenant
    # components: name, owner, retention_days, allowed_egress_cidrs, etc.
  }))
  default = {}
}
