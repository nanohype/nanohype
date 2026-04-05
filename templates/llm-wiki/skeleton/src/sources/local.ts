import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { readdir } from "fs/promises";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { parse, stringify } from "yaml";
import type { Source, SourceProvider } from "./types.js";
import { registerSourceProvider } from "./registry.js";
import { getConfig } from "../config.js";

function sourcesDir(tenantId: string): string {
  return join(getConfig().WIKI_DATA_DIR, tenantId, "sources");
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

class LocalSourceProvider implements SourceProvider {
  readonly name = "local";

  async ingest(tenantId: string, ref: string): Promise<Source> {
    // Reject absolute paths and path traversal — sources must be relative to cwd
    const resolved = resolve(ref);
    const cwd = process.cwd();
    if (!resolved.startsWith(cwd + "/") && resolved !== cwd) {
      throw new Error(`Source path must be within the working directory: "${ref}"`);
    }

    if (!existsSync(resolved)) {
      throw new Error(`Source file not found: ${ref}`);
    }

    const content = readFileSync(resolved, "utf-8");
    const contentHash = hashContent(content);

    const source: Source = {
      id: contentHash,
      tenantId,
      ref,
      content,
      contentHash,
      ingestedAt: new Date(),
      provider: "local",
    };

    const dir = sourcesDir(tenantId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const metaPath = join(dir, `${contentHash}.yaml`);
    writeFileSync(
      metaPath,
      stringify({
        id: source.id,
        tenantId: source.tenantId,
        ref: source.ref,
        contentHash: source.contentHash,
        ingestedAt: source.ingestedAt.toISOString(),
        provider: source.provider,
      }),
      "utf-8",
    );

    return source;
  }

  async list(tenantId: string): Promise<Source[]> {
    const dir = sourcesDir(tenantId);
    if (!existsSync(dir)) return [];

    const entries = await readdir(dir, { withFileTypes: true });
    const sources: Source[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;

      const filePath = join(dir, entry.name);
      const raw = parse(readFileSync(filePath, "utf-8"));
      if (!raw || typeof raw !== "object") continue;

      sources.push({
        id: raw.id,
        tenantId: raw.tenantId,
        ref: raw.ref,
        content: "",  // metadata-only listing; content is on disk at ref
        contentHash: raw.contentHash,
        ingestedAt: new Date(raw.ingestedAt),
        provider: raw.provider,
      });
    }

    return sources;
  }
}

registerSourceProvider("local", () => new LocalSourceProvider());
