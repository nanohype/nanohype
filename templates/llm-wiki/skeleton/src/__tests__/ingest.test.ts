import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";
import type { StorageProvider } from "../storage/types.js";
import type { Page, PageMeta } from "../wiki/types.js";
import { serializePage } from "../wiki/page.js";
import { resetConfig } from "../config.js";

const pages = new Map<string, string>();
let llmResponse: string;

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
  getSourceProvider: () => ({
    name: "mock-source",
    ingest: async (_tenantId: string, ref: string) => ({
      id: `src-${ref}`,
      tenantId: _tenantId,
      ref,
      content: "Apollo 11 landed on the Moon on July 20, 1969. Neil Armstrong was the first person to walk on the lunar surface.",
      contentHash: "abc123",
      ingestedAt: new Date(),
      provider: "mock-source",
    }),
  }),
  registerSourceProvider: vi.fn(),
  listSourceProviders: () => ["mock-source"],
}));

vi.mock("../llm/index.js", () => ({
  getLlmProvider: () => ({
    name: "mock-llm",
    complete: async () => llmResponse,
  }),
  registerLlmProvider: vi.fn(),
  listLlmProviders: () => ["mock-llm"],
}));

let tempDir: string;

beforeEach(() => {
  pages.clear();
  tempDir = mkdtempSync(join(tmpdir(), "wiki-ingest-test-"));
  process.env["WIKI_DATA_DIR"] = tempDir;
  process.env["WIKI_STORAGE_PROVIDER"] = "mock-test";
  process.env["WIKI_SOURCE_PROVIDER"] = "mock-source";
  process.env["WIKI_LLM_PROVIDER"] = "mock-llm";
  resetConfig();

  // Create tenant data
  const tenantsData = {
    tenants: [
      {
        id: "test-tenant",
        name: "Test Tenant",
        description: "For testing",
        schema: join(tempDir, "schema.yaml"),
        roles: {},
      },
    ],
  };
  writeFileSync(join(tempDir, "tenants.yaml"), stringify(tenantsData), "utf-8");

  // Create schema file
  const schema = {
    name: "test-schema",
    description: "Test schema",
    pageTypes: [
      { name: "entity", description: "An entity", requiredSections: ["Summary", "Details", "References"] },
      { name: "timeline", description: "A timeline", requiredSections: ["Overview", "Events"] },
    ],
    structure: { index: "index.md", orphanThresholdDays: 14, contradictionPolicy: "flag" },
    llm: { provider: "mock-llm", model: "test", temperature: 0.2, maxPagesPerIngest: 10 },
  };
  writeFileSync(join(tempDir, "schema.yaml"), stringify(schema), "utf-8");
  mkdirSync(join(tempDir, "test-tenant", "wiki"), { recursive: true });
  mkdirSync(join(tempDir, "test-tenant", "sources"), { recursive: true });

  llmResponse = JSON.stringify({
    pages: [
      {
        path: "apollo-11.md",
        title: "Apollo 11",
        type: "entity",
        content: "## Summary\nApollo 11 was the first crewed mission to land on the Moon.\n\n## Details\nLanded July 20, 1969. Commander: [[neil-armstrong.md]].\n\n## References\nNASA archives.",
        action: "create",
      },
      {
        path: "neil-armstrong.md",
        title: "Neil Armstrong",
        type: "entity",
        content: "## Summary\nFirst person to walk on the Moon.\n\n## Details\nAstronaut on [[apollo-11.md]].\n\n## References\nBiography records.",
        action: "create",
      },
    ],
    contradictions: [],
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  resetConfig();
  vi.restoreAllMocks();
});

describe("ingest operation", () => {
  it("creates pages from source material", async () => {
    const { ingest } = await import("../operations/ingest.js");
    const result = await ingest("test-tenant", "apollo-doc");

    expect(result.skipped).toBe(false);
    expect(result.sourceId).toBe("src-apollo-doc");
    expect(result.pagesCreated).toContain("apollo-11.md");
    expect(result.pagesCreated).toContain("neil-armstrong.md");
    expect(result.pagesUpdated).toEqual([]);
  });

  it("writes pages to storage", async () => {
    const { ingest } = await import("../operations/ingest.js");
    await ingest("test-tenant", "apollo-doc");

    expect(pages.has("apollo-11.md")).toBe(true);
    expect(pages.has("neil-armstrong.md")).toBe(true);
    expect(pages.has("index.md")).toBe(true);
  });

  it("rebuilds the index after ingest", async () => {
    const { ingest } = await import("../operations/ingest.js");
    await ingest("test-tenant", "apollo-doc");

    const indexContent = pages.get("index.md");
    expect(indexContent).toBeDefined();
    expect(indexContent).toContain("Apollo 11");
    expect(indexContent).toContain("Neil Armstrong");
  });

  it("reports contradictions from LLM", async () => {
    llmResponse = JSON.stringify({
      pages: [
        {
          path: "date.md",
          title: "Landing Date",
          type: "entity",
          content: "## Summary\nJuly 20.\n\n## Details\nDetails.\n\n## References\nRefs.",
          action: "create",
        },
      ],
      contradictions: [
        { pageA: "date.md", pageB: "existing.md", claim: "Conflicting dates" },
      ],
    });

    const { ingest } = await import("../operations/ingest.js");
    const result = await ingest("test-tenant", "conflict-doc");

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].claim).toBe("Conflicting dates");
  });

  it("handles update actions for existing pages", async () => {
    const existingMeta: PageMeta = {
      title: "Apollo 11",
      type: "entity",
      sources: ["old-source"],
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      confidence: "sourced",
    };
    const existingPage: Page = {
      path: "apollo-11.md",
      meta: existingMeta,
      content: "## Summary\nOld content.\n\n## Details\nOld details.\n\n## References\nOld refs.",
    };
    pages.set("apollo-11.md", serializePage(existingPage));

    llmResponse = JSON.stringify({
      pages: [
        {
          path: "apollo-11.md",
          title: "Apollo 11",
          type: "entity",
          content: "## Summary\nUpdated content.\n\n## Details\nNew details.\n\n## References\nNew refs.",
          action: "update",
        },
      ],
      contradictions: [],
    });

    const { ingest } = await import("../operations/ingest.js");
    const result = await ingest("test-tenant", "update-doc");

    expect(result.pagesUpdated).toContain("apollo-11.md");
    expect(result.pagesCreated).toEqual([]);
  });
});
