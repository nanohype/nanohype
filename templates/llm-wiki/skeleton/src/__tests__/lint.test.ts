import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";
import type { StorageProvider } from "../storage/types.js";
import type { PageMeta } from "../wiki/types.js";
import { serializePage } from "../wiki/page.js";
import { resetConfig } from "../config.js";

const pages = new Map<string, string>();

const mockStorage: StorageProvider = {
  name: "mock-test",
  async readPage(_tenantId: string, path: string) {
    return pages.get(path) ?? null;
  },
  async writePage(_tenantId: string, path: string, content: string) {
    pages.set(path, content);
  },
  async deletePage(_tenantId: string, path: string) {
    pages.delete(path);
  },
  async listPages() {
    return [...pages.keys()].filter((k) => k.endsWith(".md"));
  },
  async search() {
    return [];
  },
  async getHistory() {
    return [];
  },
};

vi.mock("../storage/index.js", () => ({
  getStorageProvider: () => mockStorage,
  registerStorageProvider: vi.fn(),
  listStorageProviders: () => ["mock-test"],
}));

vi.mock("../sources/index.js", () => ({
  getSourceProvider: vi.fn(),
  registerSourceProvider: vi.fn(),
  listSourceProviders: () => [],
}));

vi.mock("../llm/index.js", () => ({
  getLlmProvider: vi.fn(),
  registerLlmProvider: vi.fn(),
  listLlmProviders: () => [],
}));

let tempDir: string;

function seedPage(
  path: string,
  title: string,
  type: string,
  content: string,
  overrides?: Partial<PageMeta>,
): void {
  const meta: PageMeta = {
    title,
    type,
    sources: ["seed"],
    createdAt: new Date(),
    updatedAt: new Date(),
    confidence: "sourced",
    ...overrides,
  };
  pages.set(path, serializePage({ path, meta, content }));
}

beforeEach(() => {
  pages.clear();
  tempDir = mkdtempSync(join(tmpdir(), "wiki-lint-test-"));
  process.env["WIKI_DATA_DIR"] = tempDir;
  process.env["WIKI_STORAGE_PROVIDER"] = "mock-test";
  process.env["WIKI_SOURCE_PROVIDER"] = "mock-source";
  process.env["WIKI_LLM_PROVIDER"] = "mock-llm";
  resetConfig();

  const tenantsData = {
    tenants: [
      {
        id: "test-tenant",
        name: "Test Tenant",
        description: "",
        schema: join(tempDir, "schema.yaml"),
        roles: {},
      },
    ],
  };
  writeFileSync(join(tempDir, "tenants.yaml"), stringify(tenantsData), "utf-8");

  const schema = {
    name: "test-schema",
    description: "Test",
    pageTypes: [
      { name: "entity", description: "Entity", requiredSections: ["Summary", "Details", "References"] },
      { name: "concept", description: "Concept", requiredSections: ["Definition", "Context", "Related Concepts"] },
    ],
    structure: { index: "index.md", orphanThresholdDays: 14, contradictionPolicy: "flag" },
    llm: { provider: "mock-llm", model: "test", temperature: 0.2, maxPagesPerIngest: 10 },
  };
  writeFileSync(join(tempDir, "schema.yaml"), stringify(schema), "utf-8");
  mkdirSync(join(tempDir, "test-tenant", "wiki"), { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  resetConfig();
  vi.restoreAllMocks();
});

describe("lint operation", () => {
  it("detects orphan pages", async () => {
    seedPage(
      "connected.md",
      "Connected",
      "entity",
      "## Summary\nConnected.\n\n## Details\nLinks to [[other.md]].\n\n## References\nRef.",
    );
    seedPage(
      "other.md",
      "Other",
      "entity",
      "## Summary\nOther.\n\n## Details\nLinks to [[connected.md]].\n\n## References\nRef.",
    );
    seedPage(
      "orphan.md",
      "Orphan",
      "entity",
      "## Summary\nAlone.\n\n## Details\nNo links here.\n\n## References\nRef.",
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    const orphanIssues = result.issues.filter((i) => i.type === "orphan");
    const orphanPages = orphanIssues.map((i) => i.page);
    expect(orphanPages).toContain("orphan.md");
  });

  it("detects broken links", async () => {
    seedPage(
      "page-a.md",
      "Page A",
      "entity",
      "## Summary\nA.\n\n## Details\nSee [[nonexistent.md]].\n\n## References\nRef.",
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    const brokenIssues = result.issues.filter((i) => i.type === "broken-link");
    expect(brokenIssues).toHaveLength(1);
    expect(brokenIssues[0].message).toContain("nonexistent.md");
    expect(brokenIssues[0].page).toBe("page-a.md");
  });

  it("detects stale pages", async () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 30);

    seedPage(
      "stale.md",
      "Stale Page",
      "entity",
      "## Summary\nOld.\n\n## Details\nOld details.\n\n## References\nRef.",
      { updatedAt: staleDate },
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    const staleIssues = result.issues.filter((i) => i.type === "stale");
    expect(staleIssues).toHaveLength(1);
    expect(staleIssues[0].page).toBe("stale.md");
  });

  it("detects missing required sections", async () => {
    seedPage(
      "incomplete.md",
      "Incomplete",
      "entity",
      "## Summary\nHas summary only.",
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    const schemaIssues = result.issues.filter((i) => i.type === "schema-violation");
    const messages = schemaIssues.map((i) => i.message);
    expect(messages.some((m) => m.includes("Details"))).toBe(true);
    expect(messages.some((m) => m.includes("References"))).toBe(true);
  });

  it("reports healthy when no errors exist", async () => {
    seedPage(
      "good-a.md",
      "Good A",
      "entity",
      "## Summary\nA.\n\n## Details\nLinks to [[good-b.md]].\n\n## References\nRef.",
    );
    seedPage(
      "good-b.md",
      "Good B",
      "entity",
      "## Summary\nB.\n\n## Details\nLinks to [[good-a.md]].\n\n## References\nRef.",
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    // May have warnings (orphans) but no errors
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(0);
    expect(result.healthy).toBe(true);
  });

  it("reports unhealthy when errors exist", async () => {
    seedPage(
      "broken.md",
      "Broken",
      "entity",
      "## Summary\nBroken page with [[ghost.md]] and missing sections.",
    );

    const { lint } = await import("../operations/lint.js");
    const result = await lint("test-tenant");

    expect(result.healthy).toBe(false);
  });
});
