import { getConfig } from "../config.js";
import { getStorageProvider } from "../storage/index.js";
import { getSourceProvider } from "../sources/index.js";
import { getLlmProvider } from "../llm/index.js";
import { parsePage, serializePage, createPage } from "../wiki/page.js";
import { buildIndex } from "../wiki/index-manager.js";
import { loadSchema } from "../schema/parser.js";
import { getTenant } from "../tenant/registry.js";
import { acquireWriteLock } from "./queue.js";
import type { Page, PageMeta } from "../wiki/types.js";
import type { IngestResult } from "./types.js";

interface LlmIngestPage {
  path: string;
  title: string;
  type: string;
  content: string;
  action: "create" | "update";
}

interface LlmIngestResponse {
  pages: LlmIngestPage[];
  contradictions: { pageA: string; pageB: string; claim: string }[];
}

function buildSystemPrompt(
  schema: ReturnType<typeof loadSchema>,
  existingContext: string,
): string {
  const pageTypeDescriptions = schema.pageTypes
    .map((pt) => {
      const sections = pt.requiredSections.map((s) => `  - ${s}`).join("\n");
      return `### ${pt.name}\n${pt.description}\nRequired sections:\n${sections}`;
    })
    .join("\n\n");

  return `You are a knowledge wiki curator. Your task is to integrate new source material into a structured wiki.

## Wiki Schema: ${schema.name}
${schema.description}

## Page Types
${pageTypeDescriptions}

## Rules
- Each page MUST have all required sections for its type as markdown headings (## Section Name).
- Use [[page-path]] syntax for cross-references between wiki pages.
- Page paths should be kebab-case .md files (e.g., "my-topic.md").
- If the source material updates existing knowledge, use action "update" and provide the full updated content.
- If the source material introduces new topics, use action "create".
- Flag contradictions when the source material conflicts with existing wiki content.
- Maximum ${schema.llm.maxPagesPerIngest} pages per ingest operation.
- Write clear, concise, factual content. Preserve source attribution.

## Existing Wiki Context
${existingContext || "The wiki is empty. Create initial pages as needed."}

## Response Format
Respond with valid JSON only. No markdown fences, no commentary.
{
  "pages": [
    {
      "path": "page-name.md",
      "title": "Page Title",
      "type": "entity|concept|decision|timeline",
      "content": "Markdown content with ## headings for required sections",
      "action": "create|update"
    }
  ],
  "contradictions": [
    {
      "pageA": "existing-page.md",
      "pageB": "new-or-updated-page.md",
      "claim": "Description of the conflicting claims"
    }
  ]
}`;
}

function buildExistingContext(pages: Page[]): string {
  if (pages.length === 0) return "";

  return pages
    .map((p) => `- ${p.path} [${p.meta.type}] "${p.meta.title}"`)
    .join("\n");
}

function parseIngestResponse(raw: string): LlmIngestResponse {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.pages)) {
    throw new Error("LLM response missing 'pages' array");
  }

  for (const page of parsed.pages) {
    if (!page.path || !page.title || !page.type || !page.content || !page.action) {
      throw new Error(`Invalid page entry: missing required fields in ${JSON.stringify(page)}`);
    }
    if (page.action !== "create" && page.action !== "update") {
      throw new Error(`Invalid action "${page.action}" for page "${page.path}"`);
    }
  }

  return {
    pages: parsed.pages,
    contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
  };
}

export async function ingest(tenantId: string, ref: string): Promise<IngestResult> {
  const config = getConfig();
  const storage = getStorageProvider(config.WIKI_STORAGE_PROVIDER);
  const source = getSourceProvider(config.WIKI_SOURCE_PROVIDER);
  const llm = getLlmProvider(config.WIKI_LLM_PROVIDER);

  const tenant = getTenant(tenantId);
  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found`);
  }

  const schema = loadSchema(tenant.schemaPath);

  const sourceResult = await source.ingest(tenantId, ref);

  if (!sourceResult.content.trim()) {
    return {
      sourceId: sourceResult.id,
      pagesCreated: [],
      pagesUpdated: [],
      contradictions: [],
      skipped: true,
    };
  }

  const pagePaths = await storage.listPages(tenantId);
  const existingPages: Page[] = [];

  for (const path of pagePaths) {
    const raw = await storage.readPage(tenantId, path);
    if (raw) {
      try {
        const page = parsePage(raw);
        page.path = path;
        existingPages.push(page);
      } catch {
        // Skip unparseable pages
      }
    }
  }

  const existingContext = buildExistingContext(existingPages);
  const systemPrompt = buildSystemPrompt(schema, existingContext);

  const userMessage = `Integrate the following source material into the wiki.\n\nSource reference: ${ref}\nSource ID: ${sourceResult.id}\n\n---\n\n${sourceResult.content}`;

  const response = await llm.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const ingestData = parseIngestResponse(response);

  const pagesCreated: string[] = [];
  const pagesUpdated: string[] = [];

  const release = await acquireWriteLock(tenantId);
  try {
    const now = new Date();

    for (const entry of ingestData.pages) {
      const existingPage = existingPages.find((p) => p.path === entry.path);

      const meta: PageMeta = {
        title: entry.title,
        type: entry.type,
        sources: existingPage
          ? [...new Set([...existingPage.meta.sources, sourceResult.id])]
          : [sourceResult.id],
        createdAt: existingPage?.meta.createdAt ?? now,
        updatedAt: now,
        confidence: "sourced",
      };

      const page = createPage(entry.path, meta, entry.content);
      const serialized = serializePage(page);
      const commitMsg = entry.action === "create"
        ? `Add ${entry.path} from ${ref}`
        : `Update ${entry.path} from ${ref}`;

      await storage.writePage(tenantId, entry.path, serialized, commitMsg);

      if (entry.action === "create") {
        pagesCreated.push(entry.path);
      } else {
        pagesUpdated.push(entry.path);
      }
    }

    const allPaths = await storage.listPages(tenantId);
    const allPages: Page[] = [];
    for (const path of allPaths) {
      if (path === "index.md") continue;
      const raw = await storage.readPage(tenantId, path);
      if (raw) {
        try {
          const page = parsePage(raw);
          page.path = path;
          allPages.push(page);
        } catch {
          // Skip unparseable pages
        }
      }
    }

    const indexContent = buildIndex(allPages);
    await storage.writePage(tenantId, "index.md", indexContent, `Rebuild index after ingest of ${ref}`);
  } finally {
    release();
  }

  return {
    sourceId: sourceResult.id,
    pagesCreated,
    pagesUpdated,
    contradictions: ingestData.contradictions,
    skipped: false,
  };
}
