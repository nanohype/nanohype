/**
 * __COMPONENT_NAME__
 *
 * __DESCRIPTION__
 *
 * Default tags (Environment, ManagedBy, Project) are injected by root
 * terragrunt.hcl — do not duplicate here.
 */

locals {
  name_prefix = "${var.environment}-__COMPONENT_NAME__"

  common_tags = {
    Component = "__COMPONENT_NAME__"
  }
}

# Multi-tenant components iterate over var.tenants via for_each on the
# modules/tenant submodule. Single-tenant components define resources
# directly at the root.

module "tenant" {
  for_each = var.tenants

  source = "./modules/tenant"

  tenant_id       = each.key
  tenant_config   = each.value
  name_prefix     = local.name_prefix
  environment     = var.environment
  common_tags     = local.common_tags
}
