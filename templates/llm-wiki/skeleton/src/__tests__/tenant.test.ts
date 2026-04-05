import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createTenant,
  getTenant,
  listTenants,
  deleteTenant,
} from "../tenant/registry.js";
import { resetConfig } from "../config.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wiki-tenant-test-"));
  process.env["WIKI_DATA_DIR"] = tempDir;
  resetConfig();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env["WIKI_DATA_DIR"];
  resetConfig();
});

describe("tenant registry", () => {
  it("creates a tenant", () => {
    const tenant = createTenant({
      id: "test-org",
      name: "Test Organization",
      description: "A test tenant",
      schema: "src/schema/default-schema.yaml",
    });

    expect(tenant.id).toBe("test-org");
    expect(tenant.name).toBe("Test Organization");
    expect(tenant.schemaPath).toBe("src/schema/default-schema.yaml");
  });

  it("retrieves a tenant by id", () => {
    createTenant({
      id: "lookup-test",
      name: "Lookup Test",
      description: "",
      schema: "schema.yaml",
    });

    const tenant = getTenant("lookup-test");
    expect(tenant).toBeDefined();
    expect(tenant!.id).toBe("lookup-test");
    expect(tenant!.name).toBe("Lookup Test");
  });

  it("returns undefined for missing tenant", () => {
    const tenant = getTenant("nonexistent");
    expect(tenant).toBeUndefined();
  });

  it("lists all tenants", () => {
    createTenant({ id: "a", name: "A", description: "", schema: "s.yaml" });
    createTenant({ id: "b", name: "B", description: "", schema: "s.yaml" });

    const tenants = listTenants();
    const ids = tenants.map((t) => t.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("deletes a tenant", () => {
    createTenant({ id: "to-delete", name: "Delete Me", description: "", schema: "s.yaml" });
    deleteTenant("to-delete");

    const tenant = getTenant("to-delete");
    expect(tenant).toBeUndefined();
  });

  it("throws when creating duplicate tenant", () => {
    createTenant({ id: "dup", name: "Dup", description: "", schema: "s.yaml" });
    expect(() =>
      createTenant({ id: "dup", name: "Dup Again", description: "", schema: "s.yaml" }),
    ).toThrow(/already exists/);
  });

  it("throws when deleting nonexistent tenant", () => {
    expect(() => deleteTenant("ghost")).toThrow(/not found/);
  });
});
