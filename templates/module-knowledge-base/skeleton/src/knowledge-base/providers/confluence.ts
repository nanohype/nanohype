import type { KnowledgeProvider } from "./types.js";
import type {
  Page,
  Block,
  BlockType,
  PageCreate,
  PageUpdate,
  SearchOptions,
  ListOptions,
  PaginatedResult,
} from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";

// ── Confluence Provider ────────────────────────────────────────────
//
// Confluence REST API via native fetch with basic auth (email + API
// token). Converts Confluence storage format (XHTML-like) to
// markdown. Each factory call returns a new instance with its own
// API client state and circuit breaker.
//
// Auth: CONFLUENCE_EMAIL, CONFLUENCE_TOKEN, CONFLUENCE_BASE_URL
//

function getConfig(): { baseUrl: string; email: string; token: string } {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_TOKEN;

  if (!baseUrl || !email || !token) {
    throw new Error(
      "CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, and CONFLUENCE_TOKEN environment variables are required",
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), email, token };
}

/** Convert Confluence storage format (simplified XHTML) to markdown. */
function storageToMarkdown(html: string): string {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "###### $1\n\n");

  // Bold and italic
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");

  // Code blocks
  md = md.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    "```\n$1\n```\n\n",
  );
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");

  // Blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n");

  // Horizontal rule
  md = md.replace(/<hr[^>]*\/?>/gi, "---\n\n");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br[^>]*\/?>/gi, "\n");

  // Table handling
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent: string) => {
    const rows: string[][] = [];
    const rowMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];

    for (const rowHtml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) ?? [];
      for (const cellHtml of cellMatches) {
        const cellContent = cellHtml.replace(/<[^>]+>/g, "").trim();
        cells.push(cellContent);
      }
      rows.push(cells);
    }

    if (rows.length === 0) return "";

    const lines: string[] = [];
    lines.push(`| ${rows[0].join(" | ")} |`);
    lines.push(`| ${rows[0].map(() => "---").join(" | ")} |`);
    for (let i = 1; i < rows.length; i++) {
      lines.push(`| ${rows[i].join(" | ")} |`);
    }
    return lines.join("\n") + "\n\n";
  });

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

function storageToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const md = storageToMarkdown(html);

  // Reparse the markdown into blocks (same logic as mock)
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMap: [string, BlockType][] = [
      ["### ", "heading_3"],
      ["## ", "heading_2"],
      ["# ", "heading_1"],
    ];

    let matched = false;
    for (const [prefix, type] of headingMap) {
      if (line.startsWith(prefix)) {
        blocks.push({ type, content: line.slice(prefix.length) });
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (line.startsWith("- ")) {
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
      } else if (line === "---") {
        blocks.push({ type: "divider", content: "" });
      } else if (line.trim().length > 0) {
        blocks.push({ type: "paragraph", content: line });
      }
    }

    i++;
  }

  return blocks;
}

function createConfluenceProvider(): KnowledgeProvider {
  const cb = createCircuitBreaker();

  async function confluenceFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const config = getConfig();
    const url = `${config.baseUrl}/wiki/api/v2${path}`;
    const auth = Buffer.from(`${config.email}:${config.token}`).toString("base64");

    const response = await cb.execute(() =>
      fetch(url, {
        ...options,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options?.headers,
        },
      }),
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Confluence API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  interface ConfluencePage {
    id: string;
    title: string;
    status: string;
    body?: { storage?: { value: string } };
    version?: { createdAt: string };
    _links?: { webui?: string; base?: string };
    parentId?: string;
    spaceId?: string;
  }

  function toPage(cp: ConfluencePage): Page {
    const config = getConfig();
    const storageHtml = cp.body?.storage?.value ?? "";
    const content = storageToMarkdown(storageHtml);
    const webui = cp._links?.webui ?? "";
    const url = webui ? `${config.baseUrl}/wiki${webui}` : `${config.baseUrl}/wiki/pages/${cp.id}`;

    return {
      id: cp.id,
      title: cp.title,
      content,
      metadata: {
        provider: "confluence",
        status: cp.status,
        spaceId: cp.spaceId,
        parentId: cp.parentId,
      },
      url,
      updatedAt: new Date(cp.version?.createdAt ?? Date.now()),
    };
  }

  return {
    name: "confluence",

    async getPage(pageId: string): Promise<Page> {
      logger.debug("confluence getPage", { pageId });
      const cp = await confluenceFetch<ConfluencePage>(
        `/pages/${pageId}?body-format=storage`,
      );
      return toPage(cp);
    },

    async createPage(data: PageCreate): Promise<Page> {
      logger.debug("confluence createPage", { title: data.title });

      // Convert markdown to simple HTML for storage format
      const htmlContent = `<p>${data.content.replace(/\n/g, "</p><p>")}</p>`;

      const body: Record<string, unknown> = {
        title: data.title,
        spaceId: data.parentId,
        status: "current",
        body: {
          representation: "storage",
          value: htmlContent,
        },
      };

      const cp = await confluenceFetch<ConfluencePage>("/pages", {
        method: "POST",
        body: JSON.stringify(body),
      });

      return toPage(cp);
    },

    async updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      logger.debug("confluence updatePage", { pageId });

      // Fetch current page to get version number
      const current = await confluenceFetch<ConfluencePage & { version: { number: number } }>(
        `/pages/${pageId}`,
      );

      const body: Record<string, unknown> = {
        id: pageId,
        status: "current",
        title: data.title ?? current.title,
        version: { number: current.version.number + 1 },
      };

      if (data.content) {
        const htmlContent = `<p>${data.content.replace(/\n/g, "</p><p>")}</p>`;
        body.body = {
          representation: "storage",
          value: htmlContent,
        };
      }

      const cp = await confluenceFetch<ConfluencePage>(`/pages/${pageId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      return toPage(cp);
    },

    async searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      logger.debug("confluence searchPages", { query: options.query });

      const limit = options.limit ?? 20;
      const params = new URLSearchParams({
        title: options.query,
        limit: String(limit),
        "body-format": "storage",
      });

      if (options.parentId) {
        params.set("space-id", options.parentId);
      }

      interface SearchResponse {
        results: ConfluencePage[];
        _links?: { next?: string };
      }

      const response = await confluenceFetch<SearchResponse>(`/pages?${params}`);

      return {
        items: response.results.map(toPage),
        hasMore: !!response._links?.next,
        nextCursor: response._links?.next ? String(response.results.length) : undefined,
      };
    },

    async listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      logger.debug("confluence listPages", { cursor: options?.cursor });

      const params = new URLSearchParams({
        limit: String(options?.pageSize ?? 20),
        "body-format": "storage",
      });

      if (options?.cursor) {
        params.set("cursor", options.cursor);
      }

      if (options?.parentId) {
        params.set("space-id", options.parentId);
      }

      interface ListResponse {
        results: ConfluencePage[];
        _links?: { next?: string };
      }

      const response = await confluenceFetch<ListResponse>(`/pages?${params}`);

      return {
        items: response.results.map(toPage),
        hasMore: !!response._links?.next,
        nextCursor: response._links?.next ?? undefined,
      };
    },

    async getBlocks(pageId: string): Promise<Block[]> {
      logger.debug("confluence getBlocks", { pageId });
      const cp = await confluenceFetch<ConfluencePage>(
        `/pages/${pageId}?body-format=storage`,
      );
      return storageToBlocks(cp.body?.storage?.value ?? "");
    },
  };
}

// Self-register factory
registerProvider("confluence", createConfluenceProvider);
