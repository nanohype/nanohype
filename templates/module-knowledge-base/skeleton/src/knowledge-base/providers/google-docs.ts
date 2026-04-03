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

// ── Google Docs Provider ───────────────────────────────────────────
//
// Google Docs API via native fetch with OAuth2 bearer token. Converts
// Google Docs structured JSON to markdown. Each factory call returns
// a new instance with its own circuit breaker and lazily-initialized
// state.
//
// Auth: GOOGLE_DOCS_TOKEN environment variable (OAuth2 bearer token).
//

const DOCS_API = "https://docs.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

function getToken(): string {
  const token = process.env.GOOGLE_DOCS_TOKEN;
  if (!token) {
    throw new Error("GOOGLE_DOCS_TOKEN environment variable is required");
  }
  return token;
}

interface GoogleTextRun {
  content?: string;
  textStyle?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    link?: { url?: string };
    weightedFontFamily?: { fontFamily?: string };
  };
}

interface GoogleParagraphElement {
  textRun?: GoogleTextRun;
  inlineObjectElement?: { inlineObjectId?: string };
}

interface GoogleParagraph {
  elements: GoogleParagraphElement[];
  paragraphStyle?: {
    namedStyleType?: string;
    headingId?: string;
  };
  bullet?: {
    listId?: string;
    nestingLevel?: number;
  };
}

interface GoogleStructuralElement {
  paragraph?: GoogleParagraph;
  table?: {
    tableRows: {
      tableCells: {
        content: { paragraph?: GoogleParagraph }[];
      }[];
    }[];
  };
  sectionBreak?: Record<string, unknown>;
}

interface GoogleDoc {
  documentId: string;
  title: string;
  body?: { content?: GoogleStructuralElement[] };
  revisionId?: string;
  inlineObjects?: Record<string, {
    inlineObjectProperties?: {
      embeddedObject?: {
        imageProperties?: { contentUri?: string };
        title?: string;
        description?: string;
      };
    };
  }>;
}

function paragraphToMarkdown(
  paragraph: GoogleParagraph,
  inlineObjects?: GoogleDoc["inlineObjects"],
): string {
  const style = paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";

  let text = "";
  for (const element of paragraph.elements) {
    if (element.textRun) {
      let part = element.textRun.content ?? "";
      // Strip trailing newline that Google Docs adds to each paragraph
      part = part.replace(/\n$/, "");

      const ts = element.textRun.textStyle;
      if (ts?.weightedFontFamily?.fontFamily === "Courier New" || ts?.link === undefined && part.length > 0) {
        // Apply inline formatting
        if (ts?.bold) part = `**${part}**`;
        if (ts?.italic) part = `*${part}*`;
        if (ts?.strikethrough) part = `~~${part}~~`;
      }
      if (ts?.link?.url) {
        part = `[${part}](${ts.link.url})`;
      }

      text += part;
    }

    if (element.inlineObjectElement?.inlineObjectId && inlineObjects) {
      const obj = inlineObjects[element.inlineObjectElement.inlineObjectId];
      const embedded = obj?.inlineObjectProperties?.embeddedObject;
      if (embedded?.imageProperties?.contentUri) {
        const alt = embedded.title ?? embedded.description ?? "";
        text += `![${alt}](${embedded.imageProperties.contentUri})`;
      }
    }
  }

  // Handle headings
  const headingMap: Record<string, string> = {
    HEADING_1: "# ",
    HEADING_2: "## ",
    HEADING_3: "### ",
    HEADING_4: "#### ",
    HEADING_5: "##### ",
    HEADING_6: "###### ",
  };

  if (headingMap[style]) {
    return `${headingMap[style]}${text}`;
  }

  // Handle bulleted/numbered lists
  if (paragraph.bullet) {
    const indent = "  ".repeat(paragraph.bullet.nestingLevel ?? 0);
    return `${indent}- ${text}`;
  }

  return text;
}

function docToMarkdown(doc: GoogleDoc): string {
  const elements = doc.body?.content ?? [];
  const lines: string[] = [];

  for (const element of elements) {
    if (element.paragraph) {
      const md = paragraphToMarkdown(element.paragraph, doc.inlineObjects);
      lines.push(md);
    }

    if (element.table) {
      const rows: string[][] = [];
      for (const row of element.table.tableRows) {
        const cells: string[] = [];
        for (const cell of row.tableCells) {
          const cellText = cell.content
            .map((c) => (c.paragraph ? paragraphToMarkdown(c.paragraph) : ""))
            .join(" ")
            .trim();
          cells.push(cellText);
        }
        rows.push(cells);
      }

      if (rows.length > 0) {
        lines.push(`| ${rows[0].join(" | ")} |`);
        lines.push(`| ${rows[0].map(() => "---").join(" | ")} |`);
        for (let i = 1; i < rows.length; i++) {
          lines.push(`| ${rows[i].join(" | ")} |`);
        }
      }
    }
  }

  return lines.join("\n").trim();
}

function docToBlocks(doc: GoogleDoc): Block[] {
  const elements = doc.body?.content ?? [];
  const blocks: Block[] = [];

  for (const element of elements) {
    if (element.paragraph) {
      const style = element.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";

      const typeMap: Record<string, BlockType> = {
        HEADING_1: "heading_1",
        HEADING_2: "heading_2",
        HEADING_3: "heading_3",
      };

      const content = paragraphToMarkdown(element.paragraph, doc.inlineObjects)
        .replace(/^#{1,6}\s*/, ""); // Strip heading prefix for block content

      if (typeMap[style]) {
        blocks.push({ type: typeMap[style], content });
      } else if (element.paragraph.bullet) {
        blocks.push({ type: "bulleted_list", content });
      } else if (content.trim()) {
        blocks.push({ type: "paragraph", content });
      }
    }

    if (element.table) {
      const rows: string[][] = [];
      for (const row of element.table.tableRows) {
        const cells: string[] = [];
        for (const cell of row.tableCells) {
          const cellText = cell.content
            .map((c) => (c.paragraph ? paragraphToMarkdown(c.paragraph) : ""))
            .join(" ")
            .trim();
          cells.push(cellText);
        }
        rows.push(cells);
      }
      blocks.push({ type: "table", content: "", rows });
    }
  }

  return blocks;
}

function createGoogleDocsProvider(): KnowledgeProvider {
  const cb = createCircuitBreaker();

  async function googleFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken();

    const response = await cb.execute(() =>
      fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      }),
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  function docToPage(doc: GoogleDoc, modifiedTime?: string): Page {
    return {
      id: doc.documentId,
      title: doc.title,
      content: docToMarkdown(doc),
      metadata: {
        provider: "google-docs",
        revisionId: doc.revisionId,
      },
      url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
      updatedAt: new Date(modifiedTime ?? Date.now()),
    };
  }

  return {
    name: "google-docs",

    async getPage(pageId: string): Promise<Page> {
      logger.debug("google-docs getPage", { pageId });
      const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${pageId}`);

      // Get modified time from Drive API
      const driveFile = await googleFetch<{ modifiedTime?: string }>(
        `${DRIVE_API}/files/${pageId}?fields=modifiedTime`,
      );

      return docToPage(doc, driveFile.modifiedTime);
    },

    async createPage(data: PageCreate): Promise<Page> {
      logger.debug("google-docs createPage", { title: data.title });

      // Create the document via Docs API
      const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents`, {
        method: "POST",
        body: JSON.stringify({ title: data.title }),
      });

      // Insert content using batchUpdate
      if (data.content) {
        await googleFetch<unknown>(`${DOCS_API}/documents/${doc.documentId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: data.content,
                },
              },
            ],
          }),
        });
      }

      // Move to parent folder if specified
      if (data.parentId) {
        await googleFetch<unknown>(
          `${DRIVE_API}/files/${doc.documentId}?addParents=${data.parentId}`,
          { method: "PATCH" },
        );
      }

      // Re-fetch the complete document
      const updated = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${doc.documentId}`);
      return docToPage(updated);
    },

    async updatePage(pageId: string, data: PageUpdate): Promise<Page> {
      logger.debug("google-docs updatePage", { pageId });

      const requests: Record<string, unknown>[] = [];

      if (data.title) {
        // Rename via Drive API
        await googleFetch<unknown>(`${DRIVE_API}/files/${pageId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: data.title }),
        });
      }

      if (data.content) {
        // Get current document to determine content length
        const current = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${pageId}`);
        const body = current.body?.content ?? [];
        const lastElement = body[body.length - 1];
        const endIndex = (lastElement as unknown as { endIndex?: number })?.endIndex ?? 1;

        if (endIndex > 2) {
          requests.push({
            deleteContentRange: {
              range: { startIndex: 1, endIndex: endIndex - 1 },
            },
          });
        }

        requests.push({
          insertText: {
            location: { index: 1 },
            text: data.content,
          },
        });
      }

      if (requests.length > 0) {
        await googleFetch<unknown>(`${DOCS_API}/documents/${pageId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({ requests }),
        });
      }

      const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${pageId}`);
      const driveFile = await googleFetch<{ modifiedTime?: string }>(
        `${DRIVE_API}/files/${pageId}?fields=modifiedTime`,
      );

      return docToPage(doc, driveFile.modifiedTime);
    },

    async searchPages(options: SearchOptions): Promise<PaginatedResult<Page>> {
      logger.debug("google-docs searchPages", { query: options.query });

      const limit = options.limit ?? 20;
      let q = `mimeType='application/vnd.google-apps.document' and fullText contains '${options.query.replace(/'/g, "\\'")}'`;

      if (options.parentId) {
        q += ` and '${options.parentId}' in parents`;
      }

      interface DriveListResponse {
        files: { id: string; name: string; modifiedTime: string }[];
        nextPageToken?: string;
      }

      const params = new URLSearchParams({
        q,
        pageSize: String(limit),
        fields: "files(id,name,modifiedTime),nextPageToken",
      });

      const response = await googleFetch<DriveListResponse>(
        `${DRIVE_API}/files?${params}`,
      );

      const items: Page[] = [];
      for (const file of response.files) {
        const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${file.id}`);
        items.push(docToPage(doc, file.modifiedTime));
      }

      return {
        items,
        hasMore: !!response.nextPageToken,
        nextCursor: response.nextPageToken,
      };
    },

    async listPages(options?: ListOptions): Promise<PaginatedResult<Page>> {
      logger.debug("google-docs listPages", { cursor: options?.cursor });

      let q = "mimeType='application/vnd.google-apps.document'";
      if (options?.parentId) {
        q += ` and '${options.parentId}' in parents`;
      }

      const params = new URLSearchParams({
        q,
        pageSize: String(options?.pageSize ?? 20),
        fields: "files(id,name,modifiedTime),nextPageToken",
      });

      if (options?.cursor) {
        params.set("pageToken", options.cursor);
      }

      interface DriveListResponse {
        files: { id: string; name: string; modifiedTime: string }[];
        nextPageToken?: string;
      }

      const response = await googleFetch<DriveListResponse>(
        `${DRIVE_API}/files?${params}`,
      );

      const items: Page[] = [];
      for (const file of response.files) {
        const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${file.id}`);
        items.push(docToPage(doc, file.modifiedTime));
      }

      return {
        items,
        hasMore: !!response.nextPageToken,
        nextCursor: response.nextPageToken,
      };
    },

    async getBlocks(pageId: string): Promise<Block[]> {
      logger.debug("google-docs getBlocks", { pageId });
      const doc = await googleFetch<GoogleDoc>(`${DOCS_API}/documents/${pageId}`);
      return docToBlocks(doc);
    },
  };
}

// Self-register factory
registerProvider("google-docs", createGoogleDocsProvider);
