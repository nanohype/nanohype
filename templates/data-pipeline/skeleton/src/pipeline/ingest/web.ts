/**
 * Web page ingest source.
 *
 * Fetches a URL and extracts text content using cheerio for HTML parsing.
 * Strips scripts, styles, and navigation elements to produce clean text.
 * Registers itself as the "web" ingest source on import.
 */

import { createHash } from "node:crypto";

import type { Document } from "../types.js";
import type { IngestSource } from "./types.js";
import { registerSource } from "./registry.js";
import { logger } from "../logger.js";

function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

class WebSource implements IngestSource {
  readonly name = "web";

  async load(url: string): Promise<Document[]> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        logger.warn("HTTP request failed", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        return [];
      }

      const contentType = response.headers.get("content-type") ?? "";
      const html = await response.text();

      if (!contentType.includes("text/html")) {
        // Non-HTML: return raw text content
        const trimmed = html.trim();
        if (!trimmed) return [];

        return [{
          id: contentHash(url),
          content: trimmed,
          metadata: {
            source: url,
            contentType,
            type: "web",
          },
        }];
      }

      // HTML: extract text using cheerio
      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);

      // Remove non-content elements
      $("script, style, nav, header, footer, aside, iframe, noscript").remove();

      // Extract text from body
      const text = $("body").text()
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        logger.debug("No text content extracted from page", { url });
        return [];
      }

      const title = $("title").text().trim() || undefined;

      return [{
        id: contentHash(url),
        content: text,
        metadata: {
          source: url,
          title,
          contentType: "text/html",
          type: "web",
        },
      }];
    } catch (err) {
      logger.warn("Failed to fetch URL", { url, error: String(err) });
      return [];
    }
  }
}

registerSource("web", () => new WebSource());
