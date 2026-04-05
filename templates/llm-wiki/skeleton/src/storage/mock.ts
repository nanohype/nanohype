import type { StorageProvider, PageCommit } from "./types.js";
import { registerStorageProvider } from "./registry.js";

class MockStorageProvider implements StorageProvider {
  readonly name = "mock";
  private readonly pages = new Map<string, string>();

  private key(tenantId: string, path: string): string {
    return `${tenantId}:${path}`;
  }

  async readPage(tenantId: string, path: string): Promise<string | null> {
    return this.pages.get(this.key(tenantId, path)) ?? null;
  }

  async writePage(
    tenantId: string,
    path: string,
    content: string,
    _message: string,
  ): Promise<void> {
    this.pages.set(this.key(tenantId, path), content);
  }

  async deletePage(
    tenantId: string,
    path: string,
    _message: string,
  ): Promise<void> {
    const k = this.key(tenantId, path);
    if (!this.pages.has(k)) {
      throw new Error(`Page not found: ${path}`);
    }
    this.pages.delete(k);
  }

  async listPages(tenantId: string, prefix?: string): Promise<string[]> {
    const tenantPrefix = `${tenantId}:`;
    const results: string[] = [];

    for (const key of this.pages.keys()) {
      if (!key.startsWith(tenantPrefix)) continue;
      const path = key.slice(tenantPrefix.length);
      if (prefix && !path.startsWith(prefix)) continue;
      if (path.endsWith(".md")) {
        results.push(path);
      }
    }

    return results;
  }

  async search(tenantId: string, query: string): Promise<string[]> {
    const lower = query.toLowerCase();
    const tenantPrefix = `${tenantId}:`;
    const results: string[] = [];

    for (const [key, content] of this.pages) {
      if (!key.startsWith(tenantPrefix)) continue;
      if (content.toLowerCase().includes(lower)) {
        results.push(key.slice(tenantPrefix.length));
      }
    }

    return results;
  }

  async getHistory(
    _tenantId: string,
    _path: string,
    _limit?: number,
  ): Promise<PageCommit[]> {
    return [];
  }
}

registerStorageProvider("mock", () => new MockStorageProvider());
