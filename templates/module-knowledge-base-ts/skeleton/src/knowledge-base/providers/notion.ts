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

// ── Notion Provider ────────────────────────────────────────────────
//
// Notion API v1 via native fetch with bearer token auth. Converts
// Notion block objects to markdown. Handles pages, databases, and
// search. Each factory call returns a new instance with its own
// lazily-initialized state and circuit breaker.
//
// Auth: NOTION_TOKEN environment variable.
//

const API_BASE = "https://api.notion.com/v1";
const API_VERSION = "2022-06-28";

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface NotionRichText {
  plain_text: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
  href?: string;
}

function getToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("NOTION_TOKEN environment variable is required");
  }
  return token;
}

function richTextToMarkdown(richTexts: NotionRichText[]): string {
  return richTexts
    .map((rt) => {
      let text = rt.plain_text;
      if (rt.annotations?.code) text = `\`${text}\``;
      if (rt.annotations?.bold) text = `**${text}**`;
      if (rt.annotations?.italic) text = `*${text}*`;
      if (rt.annotations?.strikethrough) text = `~~${text}~~`;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join("");
}

function notionBlockToBlock(block: NotionBlock): Block | null {
  const data = block[block.type] as Record<string, unknown> | undefined;
  if (!data) return null;

  const typeMap: Record<string, BlockType> = {
    paragraph: "paragraph",
    heading_1: "heading_1",
    heading_2: "heading_2",
    heading_3: "heading_3",
    bulleted_list_item: "bulleted_list",
    numbered_list_item: "numbered_list",
    code: "code",
    image: "image",
    divider: "divider",
    quote: "quote",
    table: "table",
    toggle: "paragraph",
  };

  const blockType = typeMap[block.type];
  if (!blockType) return null;

  if (block.type === "divider") {
    return { type: "divider", content: "" };
  }

  if (block.type === "image") {
    const imageData = data as Record<string, unknown>;
    const fileData = (imageData.file ?? imageData.external) as Record<string, string> | undefined;
    const caption = imageData.caption as NotionRichText[] | undefined;
    return {
      type: "image",
      content: "",
      url: fileData?.url ?? "",
      alt: caption ? richTextToMarkdown(caption) : undefined,
    };
  }

  if (block.type === "code") {
    const codeData = data as { rich_text: NotionRichText[]; language?: string };
    return {
      type: "code",
      content: richTextToMarkdown(codeData.rich_text),
      language: codeData.language ?? undefined,
    };
  }

  if (block.type === "table") {
    // Table blocks need child rows fetched separately; return placeholder
    return { type: "table", content: "", rows: [] };
  }

  const richText = (data as { rich_text?: NotionRichText[] }).rich_text ?? [];
  return {
    type: blockType,
    content: richTextToMarkdown(richText),
  };
}

function blocksToMarkdown(blocks: Block[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading_1":
        lines.push(`# ${block.content}`);
        break;
      case "heading_2":
        lines.push(`## ${block.content}`);
        break;
      case "heading_3":
        lines.push(`### ${block.content}`);
        break;
      case "bulleted_list":
        lines.push(`- ${block.content}`);
        break;
      case "numbered_list":
        lines.push(`1. ${block.content}`);
        break;
      case "code":
        lines.push(`\`\`\`${block.language ?? ""}`);
        lines.push(block.content);
        lines.push("```");
        break;
      case "image":
        lines.push(`![${block.alt ?? ""}](${block.url ?? ""})`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "quote":
        lines.push(`> ${block.content}`);
        break;
      case "table":
        if (block.rows) {
          for (let r = 0; r < block.rows.length; r++) {
            lines.push(`| ${block.rows[r].join(" | ")} |`);
            if (r === 0) {
              lines.push(`| ${block.rows[r].map(() => "---").join(" | ")} |`);
            }
          }
        }
        break;
      case "paragraph":
      default:
        if (block.content) lines.push(block.content);
        break;
    }

    // Render nested children
    if (block.children && block.children.length > 0) {
      const childMd = blocksToMarkdown(block.children);
      const indented = childMd
        .split("\n")
        .map((l) => (l.trim() ? `  ${l}` : l))
        .join("\n");
      lines.push(indented);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

function createNotionProvider(): KnowledgeProvider {
  const cb = createCircuitBreaker();

  async function notionFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken();
    const url = `${API_BASE}${path}`;

    const response = await cb.execute(() =>
      fetch(url, {
        ...options,
        signal: options?.signal ?? AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": API_VERSION,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      }),
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async function fetchBlocks(blockId: string): Promise<Block[]> {
    interface BlockListResponse {
      results: NotionBlock[];
      has_more: boolean;
      next_cursor: string | null;
    }

    const blocks: Block[] = [];
    let cursor: string | undefined;

    do {
      const params = cursor ? `?start_cursor=${cursor}` : "";
      const response = await notionFetch<BlockListResponse>(
        `/blocks/${blockId}/children${params}`,
      );

      for (const notionBlock of response.results) {
        const block = notionBlockToBlock(notionBlock);
        if (block) {
          // Recursively fetch nested blocks
          if (notionBlock.has_children && notionBlock.type !== "table") {
            block.children = await fetchBlocks(notionBlock.id);
          }
          blocks.push(block);
        }
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return blocks;
  }

  function extractTitle(properties: Record<string, unknown>): string {
    for (const value of Object.values(properties)) {
      const prop = value as { type?: string; title?: NotionRichText[] };
      if (prop.type === "title" && prop.title) {
        return richTextToMarkdown(prop.title);
      }
    }
    return "Untitled";
  }

  async function pageToPage(notionPage: Record<string, unknown>): Promise<Page> {
    const id = notionPage.id as string;
    const properties = (notionPage.properties ?? {}) as Record<string, unknown>;
    const title = extractTitle(properties);

    const blocks = await fetchBlocks(id);
    const content = blocksToMarkdown(blocks);

    return {
      id,
      title,
      content,
      metadata: {
        provider: "notion",
        archived: notionPage.archived,
        createdTime: notionPage.created_time,
        lastEditedTime: notionPage.last_edited_time,
      },
      url: (notionPage.url as string) ?? `https://www.notion.so/${id.replace(/-/g, "")}`,
      updatedAt: new Date((notionPage.last_edited_time as string) ?? Date.now()),
    };
  }

  return {
    name: "notion",

    async getPage(pageId: string): Promise<Page> {
      logger.debug("notion getPage", { pageId });
      const notionPage = await notionFetch<Record<string, unknown>>(`/pages/${pageId}`);
      return pageToPage(notionPage);
    },

    async createPage(data: PageCreate): Promise<Page> {
      logger.debug("notion createPage", { title: data.title });

      // Convert markdown content to Notion paragraph blocks
      const children = data.content.split("\n").filter(Boolean).map((line) => ({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: line } }],
        },
      }));

      const body: Record<string, unknown> = {
        parent: data.parentId
          ? { page_id: data.parentId }
          : { page_id: data.parentId ?? "" },
        properties: {
          title: {
            title: [{ type: "text", text: { content: data.title } }],
          },
        },
        children,
      };

      const notionPage = await notionFetch<Record<string, unknown>>("/pages", {
        method: "POST",
        body: JSON.stringify(body),
      });

      return pageToPage(notionPage);
    },

    async updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      logger.debug("notion updatePage", { pageId });

      const body: Record<string, unknown> = {};
      if (data.title) {
        body.properties = {
          title: {
            title: [{ type: "text", text: { content: data.title } }],
          },
        };
      }

      await notionFetch<Record<string, unknown>>(`/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      // If content changed, archive existing blocks and append new ones
      if (data.content) {
        const existingBlocks = await notionFetch<{ results: { id: string }[] }>(
          `/blocks/${pageId}/children`,
        );

        // Delete existing blocks
        for (const block of existingBlocks.results) {
          await notionFetch<unknown>(`/blocks/${block.id}`, { method: "DELETE" });
        }

        // Append new content blocks
        const children = data.content.split("\n").filter(Boolean).map((line) => ({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: line } }],
          },
        }));

        await notionFetch<unknown>(`/blocks/${pageId}/children`, {
          method: "PATCH",
          body: JSON.stringify({ children }),
        });
      }

      // Re-fetch the updated page
      const updated = await notionFetch<Record<string, unknown>>(`/pages/${pageId}`);
      return pageToPage(updated);
    },

    async searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      logger.debug("notion searchPages", { query: options.query });

      const body: Record<string, unknown> = {
        query: options.query,
        page_size: options.limit ?? 20,
        filter: { property: "object", value: "page" },
      };

      interface SearchResponse {
        results: Record<string, unknown>[];
        has_more: boolean;
        next_cursor: string | null;
      }

      const response = await notionFetch<SearchResponse>("/search", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const items = await Promise.all(response.results.map(pageToPage));

      return {
        items,
        hasMore: response.has_more,
        nextCursor: response.next_cursor ?? undefined,
      };
    },

    async listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      logger.debug("notion listPages", { cursor: options?.cursor });

      // If parentId is given and it's a database, query the database
      if (options?.parentId) {
        const body: Record<string, unknown> = {
          page_size: options?.pageSize ?? 20,
        };
        if (options?.cursor) {
          body.start_cursor = options.cursor;
        }

        interface QueryResponse {
          results: Record<string, unknown>[];
          has_more: boolean;
          next_cursor: string | null;
        }

        const response = await notionFetch<QueryResponse>(
          `/databases/${options.parentId}/query`,
          { method: "POST", body: JSON.stringify(body) },
        );

        const items = await Promise.all(response.results.map(pageToPage));

        return {
          items,
          hasMore: response.has_more,
          nextCursor: response.next_cursor ?? undefined,
        };
      }

      // Otherwise, search all pages
      const body: Record<string, unknown> = {
        filter: { property: "object", value: "page" },
        page_size: options?.pageSize ?? 20,
      };
      if (options?.cursor) {
        body.start_cursor = options.cursor;
      }

      interface SearchResponse {
        results: Record<string, unknown>[];
        has_more: boolean;
        next_cursor: string | null;
      }

      const response = await notionFetch<SearchResponse>("/search", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const items = await Promise.all(response.results.map(pageToPage));

      return {
        items,
        hasMore: response.has_more,
        nextCursor: response.next_cursor ?? undefined,
      };
    },

    async getBlocks(pageId: string): Promise<Block[]> {
      logger.debug("notion getBlocks", { pageId });
      return fetchBlocks(pageId);
    },
  };
}

// Self-register factory
registerProvider("notion", createNotionProvider);
