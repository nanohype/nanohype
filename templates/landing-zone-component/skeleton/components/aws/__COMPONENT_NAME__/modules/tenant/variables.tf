variable "tenant_id" {
  description = "Tenant identifier (the for_each key from the root module)."
  type        = string
}

variable "tenant_config" {
  description = "Tenant configuration object. Shape defined by the root component's var.tenants type."
  type        = any
}

variable "name_prefix" {
  description = "Resource-name prefix combining environment + component name."
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, production, org)."
  type        = string
}

variable "common_tags" {
  description = "Base tags to merge into every resource's tags map."
  type        = map(string)
  default     = {}
}
