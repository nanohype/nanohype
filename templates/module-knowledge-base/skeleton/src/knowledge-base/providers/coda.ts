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
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";

// ── Coda Provider ──────────────────────────────────────────────────
//
// Coda API v1 via native fetch with bearer token auth. Converts
// Coda docs, pages, and tables to markdown. Each factory call returns
// a new instance with its own circuit breaker.
//
// Auth: CODA_TOKEN environment variable.
//

const API_BASE = "https://coda.io/apis/v1";

function getToken(): string {
  const token = process.env.CODA_TOKEN;
  if (!token) {
    throw new Error("CODA_TOKEN environment variable is required");
  }
  return token;
}

interface CodaPage {
  id: string;
  name: string;
  browserLink: string;
  updatedAt: string;
  parent?: { id: string };
  contentUrl?: string;
}

interface CodaDoc {
  id: string;
  name: string;
  browserLink: string;
  updatedAt: string;
}

function createCodaProvider(): KnowledgeProvider {
  const cb = createCircuitBreaker();

  async function codaFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken();
    const url = `${API_BASE}${path}`;

    const response = await cb.execute(() =>
      fetch(url, {
        ...options,
        signal: options?.signal ?? AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      }),
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Coda API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async function fetchPageContent(docId: string, pageId: string): Promise<string> {
    // Coda pages don't have a direct markdown export. We fetch the page
    // content as HTML and convert to markdown, or build from sections.
    // For now, fetch page info and any tables within it.

    interface CodaSection {
      id: string;
      name: string;
      content?: string;
    }

    // Try to get sections under this page
    interface SectionsResponse {
      items: CodaSection[];
    }

    const lines: string[] = [];

    try {
      const sections = await codaFetch<SectionsResponse>(
        `/docs/${docId}/pages/${pageId}/content`,
      );

      if (sections.items) {
        for (const section of sections.items) {
          if (section.name) {
            lines.push(`## ${section.name}`);
          }
          if (section.content) {
            lines.push(section.content);
          }
          lines.push("");
        }
      }
    } catch {
      // Content endpoint may not be available; fall back to tables
    }

    // Also fetch any tables in the page
    interface TablesResponse {
      items: { id: string; name: string }[];
    }

    try {
      const tables = await codaFetch<TablesResponse>(`/docs/${docId}/tables`);

      for (const table of tables.items) {
        lines.push(`## ${table.name}`);
        lines.push("");

        interface ColumnsResponse {
          items: { id: string; name: string }[];
        }

        const columns = await codaFetch<ColumnsResponse>(
          `/docs/${docId}/tables/${table.id}/columns`,
        );

        interface RowsResponse {
          items: { values: Record<string, unknown> }[];
        }

        const rows = await codaFetch<RowsResponse>(
          `/docs/${docId}/tables/${table.id}/rows?useColumnNames=true&limit=50`,
        );

        if (columns.items.length > 0) {
          const colNames = columns.items.map((c) => c.name);
          lines.push(`| ${colNames.join(" | ")} |`);
          lines.push(`| ${colNames.map(() => "---").join(" | ")} |`);

          for (const row of rows.items) {
            const cells = colNames.map((name) => String(row.values[name] ?? ""));
            lines.push(`| ${cells.join(" | ")} |`);
          }
          lines.push("");
        }
      }
    } catch {
      // Tables endpoint may fail if no tables exist
    }

    return lines.join("\n").trim() || `# ${pageId}`;
  }

  function codaPageToPage(cp: CodaPage, content: string): Page {
    return {
      id: cp.id,
      title: cp.name,
      content,
      metadata: {
        provider: "coda",
        parentId: cp.parent?.id,
      },
      url: cp.browserLink,
      updatedAt: new Date(cp.updatedAt),
    };
  }

  return {
    name: "coda",

    async getPage(pageId: string): Promise<Page> {
      logger.debug("coda getPage", { pageId });

      // pageId format: "docId/pageId" or just "docId" for top-level doc
      const parts = pageId.split("/");
      const docId = parts[0];
      const subPageId = parts[1];

      if (subPageId) {
        const page = await codaFetch<CodaPage>(`/docs/${docId}/pages/${subPageId}`);
        const content = await fetchPageContent(docId, subPageId);
        return codaPageToPage(page, content);
      }

      // Top-level doc
      const doc = await codaFetch<CodaDoc>(`/docs/${docId}`);
      const content = await fetchPageContent(docId, docId);
      return {
        id: doc.id,
        title: doc.name,
        content,
        metadata: { provider: "coda" },
        url: doc.browserLink,
        updatedAt: new Date(doc.updatedAt),
      };
    },

    async createPage(data: PageCreate): Promise<Page> {
      logger.debug("coda createPage", { title: data.title });

      // Coda page creation requires a doc context. parentId should be a doc ID.
      const docId = data.parentId;
      if (!docId) {
        throw new Error("parentId (doc ID) is required for creating Coda pages");
      }

      const page = await codaFetch<CodaPage>(`/docs/${docId}/pages`, {
        method: "POST",
        body: JSON.stringify({
          name: data.title,
          subtitle: data.metadata?.subtitle,
        }),
      });

      return codaPageToPage(page, data.content);
    },

    async updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      logger.debug("coda updatePage", { pageId });

      const parts = pageId.split("/");
      const docId = parts[0];
      const subPageId = parts[1] ?? pageId;

      const body: Record<string, unknown> = {};
      if (data.title) body.name = data.title;

      await codaFetch<CodaPage>(`/docs/${docId}/pages/${subPageId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      // Re-fetch
      const updated = await codaFetch<CodaPage>(`/docs/${docId}/pages/${subPageId}`);
      const content = data.content ?? await fetchPageContent(docId, subPageId);
      return codaPageToPage(updated, content);
    },

    async searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      logger.debug("coda searchPages", { query: options.query });

      const limit = options.limit ?? 20;
      const params = new URLSearchParams({
        query: options.query,
        limit: String(limit),
      });

      interface DocsResponse {
        items: CodaDoc[];
        nextPageToken?: string;
      }

      const response = await codaFetch<DocsResponse>(`/docs?${params}`);

      const items: Page[] = response.items.map((doc) => ({
        id: doc.id,
        title: doc.name,
        content: "", // Content loaded lazily to avoid N+1 API calls in search
        metadata: { provider: "coda" },
        url: doc.browserLink,
        updatedAt: new Date(doc.updatedAt),
      }));

      return {
        items,
        hasMore: !!response.nextPageToken,
        nextCursor: response.nextPageToken,
      };
    },

    async listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      logger.debug("coda listPages", { cursor: options?.cursor });

      if (options?.parentId) {
        // List pages within a doc
        const params = new URLSearchParams({
          limit: String(options?.pageSize ?? 20),
        });

        if (options?.cursor) {
          params.set("pageToken", options.cursor);
        }

        interface PagesResponse {
          items: CodaPage[];
          nextPageToken?: string;
        }

        const response = await codaFetch<PagesResponse>(
          `/docs/${options.parentId}/pages?${params}`,
        );

        const items: Page[] = response.items.map((page) => ({
          id: `${options.parentId}/${page.id}`,
          title: page.name,
          content: "",
          metadata: { provider: "coda", parentId: page.parent?.id },
          url: page.browserLink,
          updatedAt: new Date(page.updatedAt),
        }));

        return {
          items,
          hasMore: !!response.nextPageToken,
          nextCursor: response.nextPageToken,
        };
      }

      // List all docs
      const params = new URLSearchParams({
        limit: String(options?.pageSize ?? 20),
      });

      if (options?.cursor) {
        params.set("pageToken", options.cursor);
      }

      interface DocsResponse {
        items: CodaDoc[];
        nextPageToken?: string;
      }

      const response = await codaFetch<DocsResponse>(`/docs?${params}`);

      const items: Page[] = response.items.map((doc) => ({
        id: doc.id,
        title: doc.name,
        content: "",
        metadata: { provider: "coda" },
        url: doc.browserLink,
        updatedAt: new Date(doc.updatedAt),
      }));

      return {
        items,
        hasMore: !!response.nextPageToken,
        nextCursor: response.nextPageToken,
      };
    },

    async getBlocks(pageId: string): Promise<Block[]> {
      logger.debug("coda getBlocks", { pageId });

      const page = await this.getPage(pageId);
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
        } else if (line.startsWith("|")) {
          // Parse markdown table
          const rows: string[][] = [];
          while (i < lines.length && lines[i].startsWith("|")) {
            const row = lines[i]
              .split("|")
              .slice(1, -1)
              .map((c) => c.trim());
            // Skip separator rows
            if (!row.every((c) => /^-+$/.test(c))) {
              rows.push(row);
            }
            i++;
          }
          blocks.push({ type: "table", content: "", rows });
          continue; // Skip the i++ at the end
        } else if (line === "---") {
          blocks.push({ type: "divider", content: "" });
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
registerProvider("coda", createCodaProvider);
