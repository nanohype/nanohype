import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import type { Role, TenantConfig } from "./types.js";
import { getConfig } from "../config.js";

function loadTenantsData(): { tenants: TenantConfig[] } {
  const path = join(getConfig().WIKI_DATA_DIR, "tenants.yaml");
  if (!existsSync(path)) return { tenants: [] };
  return parse(readFileSync(path, "utf-8")) ?? { tenants: [] };
}

export function checkAccess(
  tenantId: string,
  userId: string,
  requiredRole: Role,
): boolean {
  const data = loadTenantsData();
  const config = data.tenants.find((t) => t.id === tenantId);
  if (!config) return false;

  const userRole = config.roles[userId];
  if (!userRole) return false;

  const hierarchy: Record<Role, number> = { admin: 3, editor: 2, reader: 1 };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

export function assignRole(
  tenantId: string,
  userId: string,
  role: Role,
): void {
  const data = loadTenantsData();
  const tenant = data.tenants.find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`Tenant "${tenantId}" not found`);
  tenant.roles[userId] = role;
  const path = join(getConfig().WIKI_DATA_DIR, "tenants.yaml");
  writeFileSync(path, stringify(data), "utf-8");
}
