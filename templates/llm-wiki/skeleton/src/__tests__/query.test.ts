import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { StorageProvider } from "../storage/types.js";
import type { PageMeta } from "../wiki/types.js";
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
  getSourceProvider: vi.fn(),
  registerSourceProvider: vi.fn(),
  listSourceProviders: () => [],
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

function seedPage(
  path: string,
  title: string,
  type: string,
  content: string,
): void {
  const meta: PageMeta = {
    title,
    type,
    sources: ["seed"],
    createdAt: new Date(),
    updatedAt: new Date(),
    confidence: "sourced",
  };
  pages.set(path, serializePage({ path, meta, content }));
}

beforeEach(() => {
  pages.clear();
  tempDir = mkdtempSync(join(tmpdir(), "wiki-query-test-"));
  process.env["WIKI_DATA_DIR"] = tempDir;
  process.env["WIKI_STORAGE_PROVIDER"] = "mock-test";
  process.env["WIKI_SOURCE_PROVIDER"] = "mock-source";
  process.env["WIKI_LLM_PROVIDER"] = "mock-llm";
  resetConfig();

  // Seed wiki with pages
  seedPage(
    "apollo-11.md",
    "Apollo 11",
    "entity",
    "## Summary\nApollo 11 was the first Moon landing mission, launched on a Saturn V rocket.\n\n## Details\nCommander: Neil Armstrong. Landed July 20, 1969.\n\n## References\nNASA.",
  );
  seedPage(
    "neil-armstrong.md",
    "Neil Armstrong",
    "entity",
    "## Summary\nFirst person to walk on the Moon.\n\n## Details\nAstronaut on Apollo 11.\n\n## References\nBiography.",
  );

  llmResponse = JSON.stringify({
    answer: "Apollo 11 landed on the Moon on July 20, 1969. Neil Armstrong was the commander.",
    citations: [
      { page: "apollo-11.md", excerpt: "Landed July 20, 1969" },
      { page: "neil-armstrong.md", excerpt: "Astronaut on Apollo 11" },
    ],
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  resetConfig();
  vi.restoreAllMocks();
});

describe("query operation", () => {
  it("returns an answer with citations", async () => {
    const { query } = await import("../operations/query.js");
    const result = await query("test-tenant", "When did Apollo 11 land?");

    expect(result.answer).toContain("Apollo 11");
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].page).toBe("apollo-11.md");
  });

  it("returns no-content message when no pages match", async () => {
    pages.clear();
    const { query } = await import("../operations/query.js");
    const result = await query("test-tenant", "something unrelated");

    expect(result.answer).toContain("No relevant pages");
    expect(result.citations).toEqual([]);
  });

  it("creates a discovery page when fileDiscovery is enabled", async () => {
    llmResponse = JSON.stringify({
      answer: "The mission used a Saturn V rocket.",
      citations: [{ page: "apollo-11.md", excerpt: "Apollo 11" }],
      suggestedPagePath: "saturn-v.md",
      suggestedPageTitle: "Saturn V",
      suggestedPageContent: "## Definition\nThe Saturn V was a heavy-lift rocket.\n\n## Context\nUsed in Apollo program.\n\n## Related Concepts\nApollo program.",
    });

    const { query } = await import("../operations/query.js");
    const result = await query("test-tenant", "What rocket was used?", {
      fileDiscovery: true,
    });

    expect(result.discoveryPage).toBe("saturn-v.md");
    expect(pages.has("saturn-v.md")).toBe(true);
  });

  it("does not create discovery page when fileDiscovery is disabled", async () => {
    llmResponse = JSON.stringify({
      answer: "Answer here.",
      citations: [],
      suggestedPagePath: "should-not-exist.md",
      suggestedPageTitle: "Ghost",
      suggestedPageContent: "Content.",
    });

    const { query } = await import("../operations/query.js");
    const result = await query("test-tenant", "question");

    expect(result.discoveryPage).toBeUndefined();
    expect(pages.has("should-not-exist.md")).toBe(false);
  });
});
