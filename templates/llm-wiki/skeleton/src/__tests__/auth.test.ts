import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfig } from "../config.js";
import { assignRole, checkAccess } from "../tenant/auth.js";
import { createTenant } from "../tenant/registry.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wiki-auth-test-"));
  process.env["WIKI_DATA_DIR"] = tempDir;
  resetConfig();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env["WIKI_DATA_DIR"];
  resetConfig();
});

describe("checkAccess", () => {
  it("denies when no tenants file exists", () => {
    expect(checkAccess("acme", "alice", "reader")).toBe(false);
  });

  it("denies when the tenants file parses to nothing", () => {
    writeFileSync(join(tempDir, "tenants.yaml"), "", "utf-8");
    expect(checkAccess("acme", "alice", "reader")).toBe(false);
  });

  it("denies for an unknown tenant", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    expect(checkAccess("other", "alice", "reader")).toBe(false);
  });

  it("denies a user with no role in the tenant", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    expect(checkAccess("acme", "alice", "reader")).toBe(false);
  });

  it("grants a role that outranks the requirement", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    assignRole("acme", "alice", "admin");
    expect(checkAccess("acme", "alice", "editor")).toBe(true);
  });

  it("grants a role equal to the requirement", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    assignRole("acme", "alice", "editor");
    expect(checkAccess("acme", "alice", "editor")).toBe(true);
  });

  it("denies a role ranked below the requirement", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    assignRole("acme", "alice", "reader");
    expect(checkAccess("acme", "alice", "admin")).toBe(false);
  });
});

describe("assignRole", () => {
  it("persists the role for later access checks", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    assignRole("acme", "alice", "editor");

    resetConfig();
    expect(checkAccess("acme", "alice", "reader")).toBe(true);
  });

  it("replaces an existing role", () => {
    createTenant({ id: "acme", name: "Acme", description: "", schema: "s.yaml" });
    assignRole("acme", "alice", "admin");
    assignRole("acme", "alice", "reader");

    expect(checkAccess("acme", "alice", "admin")).toBe(false);
    expect(checkAccess("acme", "alice", "reader")).toBe(true);
  });

  it("throws for an unknown tenant", () => {
    expect(() => assignRole("ghost", "alice", "reader")).toThrow(/not found/);
  });
});
