import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import type { Tenant, TenantConfig } from "./types.js";
import { getConfig } from "../config.js";

const TENANTS_FILE = "tenants.yaml";

function tenantsPath(): string {
  return join(getConfig().WIKI_DATA_DIR, TENANTS_FILE);
}

function loadTenants(): TenantConfig[] {
  const path = tenantsPath();
  if (!existsSync(path)) return [];
  return parse(readFileSync(path, "utf-8"))?.tenants ?? [];
}

function saveTenants(tenants: TenantConfig[]): void {
  const dir = getConfig().WIKI_DATA_DIR;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(tenantsPath(), stringify({ tenants }), "utf-8");
}

export function createTenant(config: Omit<TenantConfig, "roles">): Tenant {
  const tenants = loadTenants();
  if (tenants.some((t) => t.id === config.id)) {
    throw new Error(`Tenant "${config.id}" already exists`);
  }
  const entry: TenantConfig = { ...config, roles: {} };
  tenants.push(entry);
  saveTenants(tenants);

  const dataDir = join(getConfig().WIKI_DATA_DIR, config.id);
  for (const sub of ["sources", "wiki"]) {
    mkdirSync(join(dataDir, sub), { recursive: true });
  }

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    createdAt: new Date(),
    schemaPath: config.schema,
  };
}

export function getTenant(id: string): Tenant | undefined {
  const config = loadTenants().find((t) => t.id === id);
  if (!config) return undefined;
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    createdAt: new Date(),
    schemaPath: config.schema,
  };
}

export function listTenants(): Tenant[] {
  return loadTenants().map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    createdAt: new Date(),
    schemaPath: c.schema,
  }));
}

export function deleteTenant(id: string): void {
  const tenants = loadTenants();
  const index = tenants.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tenant "${id}" not found`);
  tenants.splice(index, 1);
  saveTenants(tenants);
}
