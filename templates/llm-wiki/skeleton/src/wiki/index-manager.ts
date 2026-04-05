import type { Page } from "./types.js";

export function buildIndex(pages: Page[]): string {
  const grouped = new Map<string, Page[]>();

  for (const page of pages) {
    const type = page.meta.type || "uncategorized";
    const group = grouped.get(type);
    if (group) {
      group.push(page);
    } else {
      grouped.set(type, [page]);
    }
  }

  const lines: string[] = ["# Wiki Index", ""];

  const sortedTypes = [...grouped.keys()].sort();
  for (const type of sortedTypes) {
    const group = grouped.get(type)!;
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}`, "");

    const sorted = [...group].sort((a, b) => a.meta.title.localeCompare(b.meta.title));
    for (const page of sorted) {
      const summary = page.content.split("\n").find((l) => l.trim().length > 0) ?? "";
      const truncated = summary.length > 80 ? summary.slice(0, 77) + "..." : summary;
      lines.push(`- [${page.meta.title}](${page.path}) — ${truncated}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

const INDEX_ENTRY_RE = /^- \[(.+?)]\((.+?)\)\s*(?:—\s*(.*))?$/;

export function parseIndex(content: string): { path: string; title: string; type: string }[] {
  const entries: { path: string; title: string; type: string }[] = [];
  let currentType = "";

  for (const line of content.split("\n")) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      currentType = heading[1].toLowerCase();
      continue;
    }

    const entry = line.match(INDEX_ENTRY_RE);
    if (entry) {
      entries.push({
        title: entry[1],
        path: entry[2],
        type: currentType,
      });
    }
  }

  return entries;
}
