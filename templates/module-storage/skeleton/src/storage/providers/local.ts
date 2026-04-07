import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Readable } from "node:stream";

import type {
  ListOptions,
  ListResult,
  StorageObject,
  UploadData,
  UploadOptions,
} from "../types.js";
import type { ProviderConfig, StorageProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// -- Local Filesystem Provider -------------------------------------------
//
// Stores objects as files on the local filesystem. The base directory
// is configured via the `basePath` config option. Object keys map
// directly to file paths relative to the base directory.
//

interface LocalConfig extends ProviderConfig {
  /** Root directory for stored files. Defaults to ".storage". */
  basePath?: string;
}

class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private basePath = ".storage";

  async init(config: LocalConfig): Promise<void> {
    if (config.basePath) {
      this.basePath = config.basePath;
    }
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async upload(
    key: string,
    data: UploadData,
    _opts?: UploadOptions
  ): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (data instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    } else if (typeof data === "string") {
      await fs.writeFile(filePath, data, "utf-8");
    } else {
      await fs.writeFile(filePath, data);
    }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolve(key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.unlink(filePath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }

  async list(prefix?: string, opts?: ListOptions): Promise<ListResult> {
    const dir = prefix ? path.join(this.basePath, prefix) : this.basePath;
    const objects: StorageObject[] = [];

    try {
      await this.walk(dir, objects);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { objects: [] };
      }
      throw err;
    }

    // Normalize keys relative to basePath
    const normalized = objects.map((obj) => ({
      ...obj,
      key: path.relative(this.basePath, obj.key).split(path.sep).join("/"),
    }));

    const startIndex = opts?.cursor ? Number(opts.cursor) : 0;
    const maxKeys = opts?.maxKeys ?? normalized.length;
    const page = normalized.slice(startIndex, startIndex + maxKeys);
    const nextIndex = startIndex + maxKeys;
    const nextCursor =
      nextIndex < normalized.length ? String(nextIndex) : undefined;

    return { objects: page, nextCursor };
  }

  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    // Local provider returns a file:// URI since there is no HTTP server.
    const filePath = this.resolve(key);
    return `file://${path.resolve(filePath)}`;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private resolve(key: string): string {
    return path.join(this.basePath, key);
  }

  private async walk(dir: string, out: StorageObject[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, out);
      } else {
        const stat = await fs.stat(full);
        out.push({
          key: full,
          size: stat.size,
          lastModified: stat.mtime,
        });
      }
    }
  }
}

// Self-register
registerProvider("local", () => new LocalStorageProvider());
