import { describe, it, expect, beforeEach } from "vitest";

// Import mock provider to trigger self-registration
import "../providers/mock.js";
import { getProvider } from "../providers/registry.js";
import { createKnowledgeIngestSource } from "../ingest/adapter.js";
import type { KnowledgeProvider } from "../providers/types.js";

describe("knowledge base ingest adapter", () => {
  let provider: KnowledgeProvider;

  beforeEach(() => {
    provider = getProvider("mock");
  });

  it("creates an IngestSource with the correct name", () => {
    const source = createKnowledgeIngestSource("mock");
    expect(source.name).toBe("knowledge-base-mock");
  });

  it("returns Document[] compatible with data-pipeline", async () => {
    // Seed pages through the provider
    await provider.createPage({
      title: "Design Docs",
      content: "# Design Docs\n\nArchitecture overview.",
    });
    await provider.createPage({
      title: "API Guide",
      content: "# API Guide\n\nEndpoint documentation.",
    });

    const source = createKnowledgeIngestSource("mock");
    const documents = await source.load("knowledge-base://mock");

    expect(documents.length).toBe(2);

    for (const doc of documents) {
      // Verify Document shape
      expect(doc).toHaveProperty("id");
      expect(doc).toHaveProperty("content");
      expect(doc).toHaveProperty("metadata");
      expect(typeof doc.id).toBe("string");
      expect(typeof doc.content).toBe("string");
      expect(doc.content.length).toBeGreaterThan(0);

      // Verify metadata fields
      expect(doc.metadata.provider).toBe("mock");
      expect(doc.metadata.pageId).toBeTruthy();
      expect(doc.metadata.title).toBeTruthy();
      expect(doc.metadata.url).toBeTruthy();
      expect(doc.metadata.path).toBeTruthy();
    }
  });

  it("document content is markdown", async () => {
    await provider.createPage({
      title: "Markdown Page",
      content: "# Title\n\n## Section\n\nParagraph text.",
    });

    const source = createKnowledgeIngestSource("mock");
    const documents = await source.load("knowledge-base://mock");

    const doc = documents.find((d) => d.metadata.title === "Markdown Page");
    expect(doc).toBeDefined();
    expect(doc!.content).toContain("# Title");
    expect(doc!.content).toContain("## Section");
  });

  it("document ID includes provider prefix", async () => {
    await provider.createPage({
      title: "Test",
      content: "# Test",
    });

    const source = createKnowledgeIngestSource("mock");
    const documents = await source.load("knowledge-base://mock");

    expect(documents[0].id).toMatch(/^mock:/);
  });

  it("respects maxPages limit", async () => {
    // Create more pages than the limit
    for (let i = 0; i < 5; i++) {
      await provider.createPage({
        title: `Page ${i}`,
        content: `# Page ${i}`,
      });
    }

    const source = createKnowledgeIngestSource("mock", { maxPages: 3 });
    const documents = await source.load("knowledge-base://mock");

    expect(documents.length).toBe(3);
  });

  it("returns empty array when no pages exist", async () => {
    const source = createKnowledgeIngestSource("mock");
    const documents = await source.load("knowledge-base://mock");

    expect(documents).toEqual([]);
  });
});
