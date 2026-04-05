import { getConfig } from "../config.js";
import { getStorageProvider } from "../storage/index.js";
import { parsePage } from "../wiki/page.js";
import { buildLinkGraph, findOrphans, findBrokenLinks } from "../wiki/link-graph.js";
import { loadSchema } from "../schema/parser.js";
import { getTenant } from "../tenant/registry.js";
import type { Page } from "../wiki/types.js";
import type { LintIssue, LintResult } from "./types.js";

function checkStaleness(pages: Page[], thresholdDays: number): LintIssue[] {
  const issues: LintIssue[] = [];
  const threshold = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;

  for (const page of pages) {
    if (page.meta.updatedAt.getTime() < threshold) {
      issues.push({
        severity: "warning",
        type: "stale",
        message: `Page has not been updated in over ${thresholdDays} days`,
        page: page.path,
      });
    }
  }

  return issues;
}

function checkSchemaCompliance(
  pages: Page[],
  schema: ReturnType<typeof loadSchema>,
): LintIssue[] {
  const issues: LintIssue[] = [];
  const typeMap = new Map(schema.pageTypes.map((pt) => [pt.name, pt]));

  for (const page of pages) {
    const pageType = typeMap.get(page.meta.type);

    if (!pageType) {
      if (page.meta.type) {
        issues.push({
          severity: "warning",
          type: "schema-violation",
          message: `Page type "${page.meta.type}" is not defined in the wiki schema`,
          page: page.path,
        });
      }
      continue;
    }

    const headings = new Set(
      [...page.content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()),
    );

    for (const required of pageType.requiredSections) {
      if (!headings.has(required)) {
        issues.push({
          severity: "error",
          type: "schema-violation",
          message: `Missing required section "${required}" for page type "${page.meta.type}"`,
          page: page.path,
        });
      }
    }
  }

  return issues;
}

export async function lint(tenantId: string): Promise<LintResult> {
  const config = getConfig();
  const storage = getStorageProvider(config.WIKI_STORAGE_PROVIDER);

  const tenant = getTenant(tenantId);
  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found`);
  }

  const schema = loadSchema(tenant.schemaPath);

  const pagePaths = await storage.listPages(tenantId);
  const pages: Page[] = [];

  for (const path of pagePaths) {
    const raw = await storage.readPage(tenantId, path);
    if (raw) {
      try {
        const page = parsePage(raw);
        page.path = path;
        pages.push(page);
      } catch {
        // Skip unparseable pages
      }
    }
  }

  const issues: LintIssue[] = [];

  const graph = buildLinkGraph(pages);
  const allPaths = pages.map((p) => p.path);

  const orphans = findOrphans(graph, allPaths);
  for (const orphan of orphans) {
    issues.push({
      severity: "warning",
      type: "orphan",
      message: "Page is not linked from any other content page",
      page: orphan,
    });
  }

  const brokenLinks = findBrokenLinks(graph, allPaths);
  for (const broken of brokenLinks) {
    issues.push({
      severity: "error",
      type: "broken-link",
      message: `Broken link to "${broken.target}"`,
      page: broken.source,
    });
  }

  issues.push(...checkStaleness(pages, schema.structure.orphanThresholdDays));
  issues.push(...checkSchemaCompliance(pages, schema));

  return {
    issues,
    pagesChecked: pages.length,
    healthy: issues.every((i) => i.severity !== "error"),
  };
}
