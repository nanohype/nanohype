import { registerStorageProvider } from "./registry.js";
import type { PageCommit, StorageProvider } from "./types.js";

class MockStorageProvider implements StorageProvider {
  readonly name = "mock";

  /**
   * One page map per tenant.
   *
   * A single map keyed by the tenant and the path joined together needs a
   * delimiter, and a delimiter a tenant id may contain partitions nothing:
   * tenant `acme:team` writing `page.md` and tenant `acme` writing
   * `team:page.md` compose the same key, so either id reads, lists, searches
   * and deletes the other's pages. Escaping the delimiter or rejecting ids
   * that spell it both answer that by describing which ids are safe, and a
   * description is only as good as the ids its author anticipated. Nesting
   * removes the composition instead: a tenant id is a whole key and never
   * part of one, so there is no id to anticipate.
   */
  private readonly tenants = new Map<string, Map<string, string>>();

  private pagesOf(tenantId: string): Map<string, string> {
    const existing = this.tenants.get(tenantId);
    if (existing) return existing;
    const pages = new Map<string, string>();
    this.tenants.set(tenantId, pages);
    return pages;
  }

  async readPage(tenantId: string, path: string): Promise<string | null> {
    return this.tenants.get(tenantId)?.get(path) ?? null;
  }

  async writePage(
    tenantId: string,
    path: string,
    content: string,
    _message: string,
  ): Promise<void> {
    this.pagesOf(tenantId).set(path, content);
  }

  async deletePage(tenantId: string, path: string, _message: string): Promise<void> {
    const pages = this.tenants.get(tenantId);
    if (!pages?.has(path)) {
      throw new Error(`Page not found: ${path}`);
    }
    pages.delete(path);
  }

  async listPages(tenantId: string, prefix?: string): Promise<string[]> {
    const results: string[] = [];

    for (const path of this.tenants.get(tenantId)?.keys() ?? []) {
      if (prefix && !path.startsWith(prefix)) continue;
      if (path.endsWith(".md")) {
        results.push(path);
      }
    }

    return results;
  }

  async search(tenantId: string, query: string): Promise<string[]> {
    const lower = query.toLowerCase();
    const results: string[] = [];

    for (const [path, content] of this.tenants.get(tenantId) ?? []) {
      if (content.toLowerCase().includes(lower)) {
        results.push(path);
      }
    }

    return results;
  }

  async getHistory(_tenantId: string, _path: string, _limit?: number): Promise<PageCommit[]> {
    return [];
  }
}

registerStorageProvider("mock", () => new MockStorageProvider());
