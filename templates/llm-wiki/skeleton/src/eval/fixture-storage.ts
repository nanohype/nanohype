import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { registerStorageProvider } from "../storage/registry.js";
import type { PageCommit, StorageProvider } from "../storage/types.js";

/**
 * The wiki the eval asks its questions of.
 *
 * The corpus under evaluation has to be the one the assertions ship with: a
 * case that asserts a page is cited is only meaningful when that page is
 * present and its wording is known. So the eval registers a storage provider
 * backed by the fixture pages and points the query pipeline at it, leaving the
 * configured storage — and whatever a consumer has written into it —
 * untouched. Only the model stays live.
 */

/** Provider name the eval selects through `WIKI_STORAGE_PROVIDER`. */
export const FIXTURE_PROVIDER = "eval-fixtures";

/** Tenant the fixture pages are filed under. */
export const FIXTURE_TENANT = "eval";

class FixtureWiki implements StorageProvider {
  readonly name = FIXTURE_PROVIDER;

  constructor(private readonly pages: Map<string, string>) {}

  async readPage(_tenantId: string, path: string): Promise<string | null> {
    return this.pages.get(path) ?? null;
  }

  async writePage(
    _tenantId: string,
    path: string,
    content: string,
    _message: string,
  ): Promise<void> {
    this.pages.set(path, content);
  }

  async deletePage(_tenantId: string, path: string, _message: string): Promise<void> {
    this.pages.delete(path);
  }

  async listPages(_tenantId: string, prefix?: string): Promise<string[]> {
    return [...this.pages.keys()].filter((p) => !prefix || p.startsWith(prefix));
  }

  async search(_tenantId: string, query: string): Promise<string[]> {
    const lower = query.toLowerCase();
    return [...this.pages.entries()]
      .filter(([, content]) => content.toLowerCase().includes(lower))
      .map(([path]) => path);
  }

  async getHistory(_tenantId: string, _path: string, _limit?: number): Promise<PageCommit[]> {
    return [];
  }
}

/**
 * Load the fixture pages in `dir` and register them as a storage provider.
 *
 * Throws when the directory holds no page: the cases assert against wording
 * that lives in these files, so a run over a wiki with nothing in it would
 * measure the pipeline's no-content path rather than the model's answer.
 */
export async function registerFixtureWiki(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(`No eval fixture wiki: ${dir} cannot be read`);
  }

  const pages = new Map<string, string>();
  for (const file of entries.filter((f) => f.endsWith(".md"))) {
    pages.set(file, await readFile(join(dir, file), "utf-8"));
  }

  if (pages.size === 0) {
    throw new Error(
      `No fixture pages in ${dir}. The cases assert against the wording of these pages, ` +
        "so an empty wiki answers every question with the no-content path.",
    );
  }

  const wiki = new FixtureWiki(pages);
  registerStorageProvider(FIXTURE_PROVIDER, () => wiki);

  return [...pages.keys()];
}
