import type { Page } from "./types.js";

const WIKI_LINK_RE = /\[\[([^\]]+)]]/g;

export function extractLinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

export function buildLinkGraph(pages: Page[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const page of pages) {
    if (!graph.has(page.path)) {
      graph.set(page.path, new Set());
    }

    const links = extractLinks(page.content);
    for (const link of links) {
      const targets = graph.get(page.path)!;
      targets.add(link);
    }
  }

  return graph;
}

export function findOrphans(
  graph: Map<string, Set<string>>,
  allPaths: string[],
): string[] {
  // A page is orphaned if no non-index page links to it
  const inbound = new Set<string>();
  for (const [source, targets] of graph) {
    if (source === "index.md" || source === "index") continue;
    for (const target of targets) {
      inbound.add(target);
    }
  }

  return allPaths.filter(
    (path) =>
      path !== "index.md" &&
      path !== "index" &&
      !inbound.has(path),
  );
}

export function findBrokenLinks(
  graph: Map<string, Set<string>>,
  allPaths: string[],
): { source: string; target: string }[] {
  const pathSet = new Set(allPaths);
  const broken: { source: string; target: string }[] = [];

  for (const [source, targets] of graph) {
    for (const target of targets) {
      if (!pathSet.has(target)) {
        broken.push({ source, target });
      }
    }
  }

  return broken;
}
