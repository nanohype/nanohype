/**
 * Local file ingest source.
 *
 * Loads documents from the local filesystem. Supports PDF (via pdf-parse),
 * Markdown, plain text, JSON, and CSV files. Recursively walks directories.
 * Registers itself as the "file" ingest source on import.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, basename } from "node:path";

import type { Document } from "../types.js";
import type { IngestSource } from "./types.js";
import { registerSource } from "./registry.js";
import { logger } from "../logger.js";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
const DATA_EXTENSIONS = new Set([".json", ".csv"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

async function loadPdf(filePath: string): Promise<string | null> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = await readFile(filePath);
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  } catch (err) {
    logger.warn("Failed to parse PDF", { path: filePath, error: String(err) });
    return null;
  }
}

async function loadTextFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.trim() || null;
  } catch (err) {
    logger.warn("Failed to read file", { path: filePath, error: String(err) });
    return null;
  }
}

class FileSource implements IngestSource {
  readonly name = "file";

  async load(location: string): Promise<Document[]> {
    const stats = await stat(location);

    if (stats.isFile()) {
      const doc = await this.loadSingleFile(location);
      return doc ? [doc] : [];
    }

    if (stats.isDirectory()) {
      return this.loadDirectory(location);
    }

    logger.warn("Unsupported file system entry", { path: location });
    return [];
  }

  private async loadSingleFile(filePath: string): Promise<Document | null> {
    const ext = extname(filePath).toLowerCase();
    let content: string | null = null;

    if (TEXT_EXTENSIONS.has(ext) || DATA_EXTENSIONS.has(ext)) {
      content = await loadTextFile(filePath);
    } else if (PDF_EXTENSIONS.has(ext)) {
      content = await loadPdf(filePath);
    } else {
      logger.debug("Skipping unsupported file type", { path: filePath, ext });
      return null;
    }

    if (!content) {
      logger.debug("Skipping empty or unreadable file", { path: filePath });
      return null;
    }

    return {
      id: contentHash(filePath),
      content,
      metadata: {
        source: filePath,
        filename: basename(filePath),
        extension: ext,
        type: "file",
      },
    };
  }

  private async loadDirectory(dir: string): Promise<Document[]> {
    const documents: Document[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir);
      const sorted = entries.sort();

      for (const entry of sorted) {
        const fullPath = join(currentDir, entry);
        const entryStats = await stat(fullPath);

        if (entryStats.isDirectory()) {
          await walk(fullPath);
        } else if (entryStats.isFile()) {
          const doc = await this.loadSingleFile(fullPath);
          if (doc) documents.push(doc);
        }
      }
    };

    await walk(dir);
    logger.info("Loaded files from directory", { dir, count: documents.length });
    return documents;
  }
}

registerSource("file", () => new FileSource());
