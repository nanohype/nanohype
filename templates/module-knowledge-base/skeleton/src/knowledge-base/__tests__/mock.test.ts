import { describe, it, expect, beforeEach } from "vitest";

// Import the mock provider module to trigger self-registration
import { resetMockState } from "../providers/mock.js";
import { getProvider } from "../providers/registry.js";
import type { KnowledgeProvider } from "../providers/types.js";

describe("mock knowledge base provider", () => {
  let provider: KnowledgeProvider;

  beforeEach(() => {
    // Reset module-level state so each test starts with an empty page store.
    resetMockState();
    provider = getProvider("mock");
  });

  it("is registered under the name 'mock'", () => {
    expect(provider.name).toBe("mock");
  });

  // ── CRUD Operations ──────────────────────────────────────────────

  it("creates a page and retrieves it by ID", async () => {
    const page = await provider.createPage({
      title: "Getting Started",
      content: "# Getting Started\n\nWelcome to the knowledge base.",
    });

    expect(page.id).toBeTruthy();
    expect(page.title).toBe("Getting Started");
    expect(page.content).toContain("# Getting Started");
    expect(page.url).toContain(page.id);

    const retrieved = await provider.getPage(page.id);
    expect(retrieved.title).toBe("Getting Started");
    expect(retrieved.content).toBe(page.content);
  });

  it("updates a page title and content", async () => {
    const page = await provider.createPage({
      title: "Draft",
      content: "# Draft\n\nInitial content.",
    });

    const updated = await provider.updatePage(page.id, {
      title: "Final",
      content: "# Final\n\nUpdated content.",
    });

    expect(updated.title).toBe("Final");
    expect(updated.content).toContain("Updated content");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(page.updatedAt.getTime());
  });

  it("partially updates a page (title only)", async () => {
    const page = await provider.createPage({
      title: "Original",
      content: "# Original\n\nKeep this content.",
    });

    const updated = await provider.updatePage(page.id, { title: "Renamed" });

    expect(updated.title).toBe("Renamed");
    expect(updated.content).toBe(page.content);
  });

  it("throws when getting a non-existent page", async () => {
    await expect(provider.getPage("nonexistent")).rejects.toThrow(/not found/i);
  });

  it("throws when updating a non-existent page", async () => {
    await expect(
      provider.updatePage("nonexistent", { title: "Updated" }),
    ).rejects.toThrow(/not found/i);
  });

  // ── Search ───────────────────────────────────────────────────────

  it("searches pages by title", async () => {
    await provider.createPage({ title: "Onboarding Guide", content: "# Onboarding" });
    await provider.createPage({ title: "API Reference", content: "# API" });
    await provider.createPage({ title: "Onboarding FAQ", content: "# FAQ" });

    const results = await provider.searchPages({ query: "onboarding" });

    expect(results.items.length).toBe(2);
    expect(results.items.every((p) => p.title.toLowerCase().includes("onboarding"))).toBe(true);
  });

  it("searches pages by content", async () => {
    await provider.createPage({
      title: "Architecture",
      content: "# Architecture\n\nUses microservices pattern.",
    });
    await provider.createPage({
      title: "Setup",
      content: "# Setup\n\nRun npm install.",
    });

    const results = await provider.searchPages({ query: "microservices" });

    expect(results.items.length).toBe(1);
    expect(results.items[0].title).toBe("Architecture");
  });

  it("respects search limit", async () => {
    for (let i = 0; i < 5; i++) {
      await provider.createPage({ title: `Doc ${i}`, content: `# Doc ${i}\n\nSearchable` });
    }

    const results = await provider.searchPages({ query: "searchable", limit: 2 });

    expect(results.items.length).toBe(2);
    expect(results.hasMore).toBe(true);
  });

  // ── List with Pagination ─────────────────────────────────────────

  it("lists pages with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await provider.createPage({ title: `Page ${i}`, content: `# Page ${i}` });
    }

    const firstPage = await provider.listPages({ pageSize: 3 });
    expect(firstPage.items.length).toBe(3);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await provider.listPages({
      pageSize: 3,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items.length).toBe(2);
    expect(secondPage.hasMore).toBe(false);
  });

  // ── Markdown Content ─────────────────────────────────────────────

  it("preserves markdown content through create and retrieve", async () => {
    const markdown = [
      "# Main Title",
      "",
      "## Section One",
      "",
      "Some paragraph text with **bold** and *italic*.",
      "",
      "- Item one",
      "- Item two",
      "- Item three",
      "",
      "```typescript",
      "const x = 42;",
      "```",
      "",
      "> A blockquote",
      "",
      "---",
      "",
      "1. First",
      "2. Second",
    ].join("\n");

    const page = await provider.createPage({
      title: "Markdown Test",
      content: markdown,
    });

    const retrieved = await provider.getPage(page.id);
    expect(retrieved.content).toBe(markdown);
  });

  // ── Blocks ───────────────────────────────────────────────────────

  it("returns blocks for a page with markdown content", async () => {
    const page = await provider.createPage({
      title: "Block Test",
      content: "# Heading\n\nA paragraph.\n\n- List item\n\n```js\ncode()\n```\n\n> Quote\n\n---",
    });

    const blocks = await provider.getBlocks(page.id);

    const types = blocks.map((b) => b.type);
    expect(types).toContain("heading_1");
    expect(types).toContain("paragraph");
    expect(types).toContain("bulleted_list");
    expect(types).toContain("code");
    expect(types).toContain("quote");
    expect(types).toContain("divider");
  });

  it("throws when getting blocks for a non-existent page", async () => {
    await expect(provider.getBlocks("nonexistent")).rejects.toThrow(/not found/i);
  });
});
