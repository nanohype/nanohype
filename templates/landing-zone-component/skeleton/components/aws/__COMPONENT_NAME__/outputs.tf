output "tenant_outputs" {
  description = "Per-tenant outputs keyed by tenant_id (resource ARNs, endpoints, etc.)"
  value = {
    for tenant_id, t in module.tenant : tenant_id => {
      # Surface whatever downstream components or apps need to consume.
      # Example: bucket_arn = t.bucket_arn, role_arn = t.role_arn
    }
  }
}
