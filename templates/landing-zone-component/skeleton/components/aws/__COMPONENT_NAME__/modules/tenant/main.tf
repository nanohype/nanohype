/**
 * Per-tenant submodule for __COMPONENT_NAME__.
 *
 * Provisions isolated resources per tenant via for_each in the root
 * module. Common patterns: per-tenant S3 bucket, per-tenant IAM role,
 * per-tenant KMS grant, per-tenant SQS queue. See landing-zone's druid,
 * pipeline, gateway, llm, mlops, rag, and governance components for
 * working examples.
 */

# Add tenant-isolated resources here. Reference inputs as:
#   var.tenant_id     — tenant identifier (the for_each key)
#   var.tenant_config — the tenant's config object (the for_each value)
#   var.name_prefix   — "<env>-<component>" prefix for resource names
#   var.environment   — environment name
#   var.common_tags   — base tags to merge into each resource's tags
