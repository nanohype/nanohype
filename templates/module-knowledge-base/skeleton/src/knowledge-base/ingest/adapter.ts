// ── Knowledge Base IngestSource Adapter ─────────────────────────────
//
// Bridges knowledge base providers into the data-pipeline IngestSource
// interface. Fetches pages from the configured provider, converts to
// Document[] where each document has markdown content, provider
// metadata, and the page title as the path.
//
// Usage:
//   const source = createKnowledgeIngestSource("notion", {
//     parentId: "database-id",
//   });
//   const documents = await source.load("knowledge-base://notion");
//

import { getProvider } from "../providers/index.js";
import type { ListOptions } from "../types.js";
import { logger } from "../logger.js";

/** Document type compatible with data-pipeline IngestSource. */
export interface Document {
  /** Unique identifier (derived from provider page ID). */
  id: string;
  /** Raw text content (markdown from the knowledge base page). */
  content: string;
  /** Source-specific metadata. */
  metadata: Record<string, unknown>;
}

/** Options for configuring the ingest source. */
export interface KnowledgeIngestOptions {
  /** Scope pages to a specific parent page, database, or space. */
  parentId?: string;
  /** Maximum number of pages to load per batch. Default: 50 */
  pageSize?: number;
  /** Maximum total pages to ingest. Default: 1000 */
  maxPages?: number;
}

/**
 * IngestSource interface compatible with data-pipeline.
 * Implements the same contract as data-pipeline's IngestSource:
 *   { name: string; load(location: string): Promise<Document[]> }
 */
export interface IngestSource {
  /** Unique source name. */
  readonly name: string;
  /** Load documents from the knowledge base. */
  load(location: string): Promise<Document[]>;
}

/**
 * Create an IngestSource that fetches pages from a knowledge base
 * provider and returns them as Document[] for pipeline ingestion.
 *
 * @param providerName  Provider to use (e.g. "notion", "confluence").
 * @param opts          Options for scoping and pagination.
 */
export function createKnowledgeIngestSource(
  providerName: string,
  opts: KnowledgeIngestOptions = {},
): IngestSource {
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 1000;

  return {
    name: `knowledge-base-${providerName}`,

    async load(_location: string): Promise<Document[]> {
      const provider = getProvider(providerName);
      const documents: Document[] = [];

      let cursor: string | undefined;
      let totalLoaded = 0;

      logger.info("knowledge ingest starting", { provider: providerName, parentId: opts.parentId });

      do {
        const listOpts: ListOptions = {
          pageSize,
          cursor,
          parentId: opts.parentId,
        };

        const result = await provider.listPages(listOpts);

        for (const page of result.items) {
          if (totalLoaded >= maxPages) break;

          // If the page content was not loaded during listing (some providers
          // defer content for performance), fetch the full page.
          let content = page.content;
          if (!content) {
            try {
              const fullPage = await provider.getPage(page.id);
              content = fullPage.content;
            } catch (err) {
              logger.warn("failed to fetch page content", {
                pageId: page.id,
                error: String(err),
              });
              continue;
            }
          }

          documents.push({
            id: `${providerName}:${page.id}`,
            content,
            metadata: {
              provider: providerName,
              pageId: page.id,
              title: page.title,
              url: page.url,
              updatedAt: page.updatedAt.toISOString(),
              path: page.title,
              ...page.metadata,
            },
          });

          totalLoaded++;
        }

        cursor = result.hasMore ? result.nextCursor : undefined;
      } while (cursor && totalLoaded < maxPages);

      logger.info("knowledge ingest complete", {
        provider: providerName,
        documentsLoaded: documents.length,
      });

      return documents;
    },
  };
}
