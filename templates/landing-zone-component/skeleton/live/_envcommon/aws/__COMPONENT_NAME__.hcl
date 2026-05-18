# __COMPONENT_NAME__ — env-shared inputs and dependency wiring.
#
# Per-env overrides go in live/aws/<account>/<region>/<env>/__COMPONENT_NAME__/terragrunt.hcl.

# Uncomment and edit dependency blocks as needed. Common patterns:
#
# dependency "network" {
#   config_path = "${get_path_relative_to_include("live")}/../network"
# }
#
# dependency "cluster" {
#   config_path = "${get_path_relative_to_include("live")}/../cluster"
# }

inputs = {
  # Shared inputs that don't vary by environment. Examples:
  # - tenants:    map of tenant configurations (if Multitenant)
  # - retention:  log/backup retention periods
  # - vpc_id:     pulled from dependency.network.outputs.vpc_id

  tenants = {}
}
