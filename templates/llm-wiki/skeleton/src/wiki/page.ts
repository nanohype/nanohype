import { parse, stringify } from "yaml";
import type { Page, PageMeta } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parsePage(content: string): Page {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("Invalid page format: missing YAML frontmatter delimiters");
  }

  const raw = parse(match[1]);
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid page format: frontmatter is not a valid YAML object");
  }

  const meta: PageMeta = {
    title: raw.title ?? "",
    type: raw.type ?? "",
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt ?? 0),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt ?? 0),
    confidence: raw.confidence ?? "inferred",
  };

  return {
    path: raw.path ?? "",
    meta,
    content: match[2].trim(),
  };
}

export function serializePage(page: Page): string {
  const frontmatter = stringify({
    title: page.meta.title,
    type: page.meta.type,
    sources: page.meta.sources,
    createdAt: page.meta.createdAt.toISOString(),
    updatedAt: page.meta.updatedAt.toISOString(),
    confidence: page.meta.confidence,
    path: page.path,
  });

  return `---\n${frontmatter}---\n\n${page.content}\n`;
}

export function createPage(path: string, meta: PageMeta, content: string): Page {
  return { path, meta, content };
}
