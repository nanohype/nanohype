export type Role = "admin" | "editor" | "reader";

export interface Tenant {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  schemaPath: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  description: string;
  schema: string;
  roles: Record<string, Role>;
}
