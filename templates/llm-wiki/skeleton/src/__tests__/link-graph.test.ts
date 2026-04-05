import { describe, it, expect } from "vitest";
import {
  extractLinks,
  buildLinkGraph,
  findOrphans,
  findBrokenLinks,
} from "../wiki/link-graph.js";
import type { Page } from "../wiki/types.js";

function makePage(path: string, content: string): Page {
  return {
    path,
    meta: {
      title: path.replace(".md", ""),
      type: "entity",
      sources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      confidence: "sourced",
    },
    content,
  };
}

describe("extractLinks", () => {
  it("extracts wiki links from content", () => {
    const links = extractLinks("See [[alpha.md]] and [[beta.md]] for details.");
    expect(links).toEqual(["alpha.md", "beta.md"]);
  });

  it("returns empty array for content without links", () => {
    const links = extractLinks("No links here.");
    expect(links).toEqual([]);
  });

  it("handles multiple links on the same line", () => {
    const links = extractLinks("[[a.md]] connects to [[b.md]] via [[c.md]]");
    expect(links).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("handles links across multiple lines", () => {
    const links = extractLinks("Line one [[a.md]]\nLine two [[b.md]]");
    expect(links).toEqual(["a.md", "b.md"]);
  });
});

describe("buildLinkGraph", () => {
  it("builds a graph from pages", () => {
    const pages = [
      makePage("a.md", "Links to [[b.md]]"),
      makePage("b.md", "Links to [[c.md]]"),
      makePage("c.md", "No outgoing links."),
    ];

    const graph = buildLinkGraph(pages);
    expect(graph.get("a.md")?.has("b.md")).toBe(true);
    expect(graph.get("b.md")?.has("c.md")).toBe(true);
    expect(graph.get("c.md")?.size).toBe(0);
  });

  it("handles empty page list", () => {
    const graph = buildLinkGraph([]);
    expect(graph.size).toBe(0);
  });
});

describe("findOrphans", () => {
  it("finds pages with no inbound links from content pages", () => {
    const pages = [
      makePage("index.md", "[[a.md]]"),
      makePage("a.md", "Links to [[b.md]]"),
      makePage("b.md", "No outgoing links."),
      makePage("orphan.md", "Lonely page."),
    ];

    const graph = buildLinkGraph(pages);
    const allPaths = pages.map((p) => p.path);
    const orphans = findOrphans(graph, allPaths);

    expect(orphans).toContain("orphan.md");
    expect(orphans).not.toContain("index.md");
    expect(orphans).not.toContain("b.md");
  });

  it("returns empty array when all pages are linked", () => {
    const pages = [
      makePage("a.md", "Links to [[b.md]]"),
      makePage("b.md", "Links to [[a.md]]"),
    ];

    const graph = buildLinkGraph(pages);
    const allPaths = pages.map((p) => p.path);
    const orphans = findOrphans(graph, allPaths);
    expect(orphans).toEqual([]);
  });
});

describe("findBrokenLinks", () => {
  it("finds links pointing to nonexistent pages", () => {
    const pages = [
      makePage("a.md", "Links to [[b.md]] and [[missing.md]]"),
      makePage("b.md", "Links to [[also-missing.md]]"),
    ];

    const graph = buildLinkGraph(pages);
    const allPaths = pages.map((p) => p.path);
    const broken = findBrokenLinks(graph, allPaths);

    expect(broken).toContainEqual({ source: "a.md", target: "missing.md" });
    expect(broken).toContainEqual({ source: "b.md", target: "also-missing.md" });
  });

  it("returns empty array when all links resolve", () => {
    const pages = [
      makePage("a.md", "Links to [[b.md]]"),
      makePage("b.md", "Links to [[a.md]]"),
    ];

    const graph = buildLinkGraph(pages);
    const allPaths = pages.map((p) => p.path);
    const broken = findBrokenLinks(graph, allPaths);
    expect(broken).toEqual([]);
  });
});
