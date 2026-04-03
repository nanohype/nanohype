import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { ProjectProvider, ProjectProviderFactory } from "../providers/types.js";

// ── Registry Tests ─────────────────────────────────────────────────
//
// Verifies the factory-based registry: each getProvider() call returns
// a new instance, factories can be registered and retrieved, and
// duplicate registration is rejected.
//

function stubFactory(name: string): ProjectProviderFactory {
  return () => ({
    name,
    async createProject() {
      return { id: "p-1", name: "stub", createdAt: "", updatedAt: "" };
    },
    async listProjects() {
      return { items: [], totalCount: 0 };
    },
    async createIssue() {
      return {
        id: "i-1",
        projectId: "p-1",
        title: "stub",
        status: "backlog",
        priority: "none" as const,
        labels: [],
        createdAt: "",
        updatedAt: "",
      };
    },
    async getIssue() {
      return {
        id: "i-1",
        projectId: "p-1",
        title: "stub",
        status: "backlog",
        priority: "none" as const,
        labels: [],
        createdAt: "",
        updatedAt: "",
      };
    },
    async updateIssue() {
      return {
        id: "i-1",
        projectId: "p-1",
        title: "stub",
        status: "backlog",
        priority: "none" as const,
        labels: [],
        createdAt: "",
        updatedAt: "",
      };
    },
    async listIssues() {
      return { items: [], totalCount: 0 };
    },
    async addComment() {
      return { id: "c-1", issueId: "i-1", body: "stub", createdAt: "" };
    },
  });
}

describe("Project provider registry", () => {
  const unique = () =>
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and retrieves a provider instance by name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const provider = getProvider(name);
    expect(provider.name).toBe(name);
  });

  it("returns independent instances from each getProvider() call", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const a = getProvider(name);
    const b = getProvider(name);
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(/not found/);
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    expect(() => registerProvider(name, stubFactory(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, stubFactory(a));
    registerProvider(b, stubFactory(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("lists built-in providers after barrel import", async () => {
    await import("../providers/index.js");
    const names = listProviders();

    expect(names).toContain("linear");
    expect(names).toContain("jira");
    expect(names).toContain("asana");
    expect(names).toContain("shortcut");
    expect(names).toContain("mock");
  });
});
