import type { KnowledgeProvider } from "./types.js";
import type {
  Page,
  Block,
  PageCreate,
  PageUpdate,
  SearchOptions,
  ListOptions,
  PaginatedResult,
} from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ──────────────────────────────────────────────────
//
// In-memory knowledge base provider for testing and development.
// Stores pages in a Map with full CRUD support, search by title
// and content, and markdown content. No external dependencies.
//
// Mock state is module-level rather than per-factory-call so that the
// adapter (which re-fetches the provider via getProvider()) sees the
// same pages a caller seeded earlier. Tests can call resetMockState()
// in beforeEach to start from a clean slate.

const pages = new Map<string, Page>();
let nextId = 1;

function generateId(): string {
  return `mock-page-${nextId++}`;
}

export function resetMockState(): void {
  pages.clear();
  nextId = 1;
}

function createMockProvider(): KnowledgeProvider {
  return {
    name: "mock",

    async getPage(pageId: string): Promise<Page> {
      const page = pages.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }
      return { ...page };
    },

    async createPage(data: PageCreate): Promise<Page> {
      const id = generateId();
      const page: Page = {
        id,
        title: data.title,
        content: data.content,
        metadata: { ...data.metadata, provider: "mock", parentId: data.parentId },
        url: `mock://pages/${id}`,
        updatedAt: new Date(),
      };
      pages.set(id, page);
      return { ...page };
    },

    async updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      const existing = pages.get(pageId);
      if (!existing) {
        throw new Error(`Page not found: ${pageId}`);
      }
      const updated: Page = {
        ...existing,
        title: data.title ?? existing.title,
        content: data.content ?? existing.content,
        metadata: { ...existing.metadata, ...data.metadata },
        updatedAt: new Date(),
      };
      pages.set(pageId, updated);
      return { ...updated };
    },

    async searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      const query = options.query.toLowerCase();
      const limit = options.limit ?? 20;

      const matches = Array.from(pages.values()).filter((page) => {
        if (options.parentId && page.metadata.parentId !== options.parentId) {
          return false;
        }
        return (
          page.title.toLowerCase().includes(query) ||
          page.content.toLowerCase().includes(query)
        );
      });

      const items = matches.slice(0, limit);
      return {
        items: items.map((p) => ({ ...p })),
        hasMore: matches.length > limit,
        nextCursor: matches.length > limit ? String(limit) : undefined,
      };
    },

    async listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      const pageSize = options?.pageSize ?? 20;
      const startIndex = options?.cursor ? parseInt(options.cursor, 10) : 0;

      let allPages = Array.from(pages.values());

      if (options?.parentId) {
        allPages = allPages.filter((p) => p.metadata.parentId === options.parentId);
      }

      const items = allPages.slice(startIndex, startIndex + pageSize);
      const hasMore = startIndex + pageSize < allPages.length;

      return {
        items: items.map((p) => ({ ...p })),
        hasMore,
        nextCursor: hasMore ? String(startIndex + pageSize) : undefined,
      };
    },

    async getBlocks(pageId: string): Promise<Block[]> {
      const page = pages.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }

      // Parse simple markdown into blocks
      const blocks: Block[] = [];
      const lines = page.content.split("\n");
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith("### ")) {
          blocks.push({ type: "heading_3", content: line.slice(4) });
        } else if (line.startsWith("## ")) {
          blocks.push({ type: "heading_2", content: line.slice(3) });
        } else if (line.startsWith("# ")) {
          blocks.push({ type: "heading_1", content: line.slice(2) });
        } else if (line.startsWith("- ")) {
          blocks.push({ type: "bulleted_list", content: line.slice(2) });
        } else if (/^\d+\. /.test(line)) {
          blocks.push({ type: "numbered_list", content: line.replace(/^\d+\. /, "") });
        } else if (line.startsWith("```")) {
          const language = line.slice(3).trim() || undefined;
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].startsWith("```")) {
            codeLines.push(lines[i]);
            i++;
          }
          blocks.push({ type: "code", content: codeLines.join("\n"), language });
        } else if (line.startsWith("> ")) {
          blocks.push({ type: "quote", content: line.slice(2) });
        } else if (line === "---" || line === "***") {
          blocks.push({ type: "divider", content: "" });
        } else if (line.startsWith("![")) {
          const altMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
          if (altMatch) {
            blocks.push({ type: "image", content: "", alt: altMatch[1], url: altMatch[2] });
          }
        } else if (line.trim().length > 0) {
          blocks.push({ type: "paragraph", content: line });
        }

        i++;
      }

      return blocks;
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
