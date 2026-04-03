// ── __PROJECT_NAME__ ────────────────────────────────────────────────
//
// __DESCRIPTION__
//
// Main entry point. Re-exports the knowledge client factory and all
// public types needed by consumers.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { KnowledgeConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import {
  knowledgeBaseRequestTotal,
  knowledgeBaseDurationMs,
} from "./metrics.js";
import type { KnowledgeProvider } from "./providers/types.js";
import type {
  Page,
  Block,
  PageCreate,
  PageUpdate,
  SearchOptions,
  ListOptions,
  PaginatedResult,
} from "./types.js";
import type { KnowledgeConfig } from "./config.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { KnowledgeProvider, KnowledgeProviderFactory } from "./providers/types.js";
export type {
  Page,
  Block,
  BlockType,
  PageCreate,
  PageUpdate,
  SearchOptions,
  ListOptions,
  PaginatedResult,
} from "./types.js";
export { KnowledgeConfigSchema } from "./config.js";
export type { KnowledgeConfig } from "./config.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";

// ── Knowledge Client Facade ───────────────────────────────────────

export interface KnowledgeClient {
  /** The underlying provider instance. */
  readonly provider: KnowledgeProvider;

  /** Retrieve a single page by ID. Content is markdown. */
  getPage(pageId: string): Promise<Page>;

  /** Create a new page from markdown content. */
  createPage(data: PageCreate): Promise<Page>;

  /** Update an existing page. */
  updatePage(pageId: string, data: PageUpdate): Promise<Page>;

  /** Search pages by query. */
  searchPages(options: SearchOptions): Promise<PaginatedResult<Page>>;

  /** List pages with pagination. */
  listPages(options?: ListOptions): Promise<PaginatedResult<Page>>;

  /** Get the block structure of a page. */
  getBlocks(pageId: string): Promise<Block[]>;

  /** List all registered provider names. */
  list(): string[];

  /** The resolved configuration. */
  readonly config: KnowledgeConfig;
}

/**
 * Create a configured knowledge base client.
 *
 * The client wraps a provider instance with OTel metrics and
 * provides the primary API for all knowledge base operations.
 *
 * ```typescript
 * const kb = await createKnowledgeClient({ provider: "notion" });
 * const page = await kb.getPage("page-id");
 * console.log(page.content); // markdown string
 * ```
 */
export async function createKnowledgeClient(
  rawConfig: Partial<KnowledgeConfig> = {},
): Promise<KnowledgeClient> {
  const parsed = KnowledgeConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid knowledge base config: ${issues}`);
  }

  validateBootstrap();

  const config = parsed.data;
  const provider = getProvider(config.provider);

  function tracked<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = performance.now();
    return fn().then(
      (result) => {
        knowledgeBaseRequestTotal.add(1, { provider: config.provider, operation });
        knowledgeBaseDurationMs.record(performance.now() - start, {
          provider: config.provider,
          operation,
        });
        return result;
      },
      (error) => {
        knowledgeBaseRequestTotal.add(1, {
          provider: config.provider,
          operation,
          error: "true",
        });
        knowledgeBaseDurationMs.record(performance.now() - start, {
          provider: config.provider,
          operation,
        });
        throw error;
      },
    );
  }

  return {
    provider,
    config,

    getPage(pageId: string): Promise<Page> {
      return tracked("getPage", () => provider.getPage(pageId));
    },

    createPage(data: PageCreate): Promise<Page> {
      return tracked("createPage", () => provider.createPage(data));
    },

    updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      return tracked("updatePage", () => provider.updatePage(pageId, data));
    },

    searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      return tracked("searchPages", () => provider.searchPages(options));
    },

    listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      return tracked("listPages", () => provider.listPages(options));
    },

    getBlocks(pageId: string): Promise<Block[]> {
      return tracked("getBlocks", () => provider.getBlocks(pageId));
    },

    list: listProviders,
  };
}
