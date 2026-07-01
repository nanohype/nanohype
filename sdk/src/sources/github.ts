import yaml from "js-yaml";
import type {
  Catalog,
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  ContractRepo,
  SkeletonFile,
  Standard,
  StandardName,
  TemplateManifest,
} from "../types.js";
import type { CatalogSource, GitHubSourceOptions } from "../source.js";
import { NanohypeError } from "../errors.js";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

// Manifest and skeleton-file fetches fan out per entry; a bounded pool keeps
// large catalogs fast without hammering the GitHub API into secondary rate
// limits the way an unbounded Promise.all would.
const FETCH_CONCURRENCY = 8;

/** Run `fn` over `items` with at most `limit` in flight, preserving result order. */
async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Catalog source that reads templates from a GitHub repository via the GitHub API.
 * Uses native fetch and in-memory TTL caching per instance. Every request carries
 * a timeout, and fetch failures surface as errors — a scaffold is rendered
 * complete or not at all, never silently partial.
 */
export class GitHubSource implements CatalogSource {
  private readonly repo: string;
  private readonly ref: string;
  private readonly token?: string;
  private readonly cacheTtl: number;
  private readonly requestTimeout: number;

  private catalogCache: CacheEntry<CatalogEntry[]> | null = null;
  private compositeCatalogCache: CacheEntry<CompositeCatalogEntry[]> | null =
    null;

  constructor(options: GitHubSourceOptions = {}) {
    this.repo = options.repo ?? "nanohype/nanohype";
    this.ref = options.ref ?? "main";
    // Fall back to GITHUB_TOKEN so a private contract repo resolves with no caller
    // config when the env var is present.
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.cacheTtl = options.cacheTtl ?? 5 * 60 * 1000;
    this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async get(url: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.requestTimeout),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NanohypeError(
          `GitHub request timed out after ${this.requestTimeout}ms: ${url}`,
        );
      }
      throw err;
    }
  }

  private raw(path: string): string {
    return `https://raw.githubusercontent.com/${this.repo}/${this.ref}/${path}`;
  }

  private isFresh<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
    return cache !== null && Date.now() - cache.fetchedAt < this.cacheTtl;
  }

  async listTemplates(): Promise<CatalogEntry[]> {
    if (this.isFresh(this.catalogCache)) return this.catalogCache.data;

    const res = await this.get(
      `https://api.github.com/repos/${this.repo}/contents/templates?ref=${this.ref}`,
    );
    if (!res.ok)
      throw new NanohypeError(`Failed to list catalog: ${res.status}`);

    const dirs = (await res.json()) as { name: string; type: string }[];
    const templateDirs = dirs.filter((d) => d.type === "dir");

    const fetched = await mapConcurrent(
      templateDirs,
      FETCH_CONCURRENCY,
      async (dir): Promise<CatalogEntry | null> => {
        const manifestRes = await this.get(
          this.raw(`templates/${dir.name}/template.yaml`),
        );
        // A directory without a template.yaml is not a template — skip it.
        // Anything else non-OK (rate limit, outage) must not silently shrink
        // the catalog.
        if (manifestRes.status === 404) return null;
        if (!manifestRes.ok) {
          throw new NanohypeError(
            `Failed to fetch manifest for template '${dir.name}': ${manifestRes.status}`,
          );
        }
        let manifest: TemplateManifest;
        try {
          manifest = yaml.load(await manifestRes.text()) as TemplateManifest;
        } catch (err) {
          throw new NanohypeError(
            `Invalid manifest for template '${dir.name}': ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return {
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          kind: manifest.kind,
          persona: manifest.persona,
          category: manifest.category,
          tags: manifest.tags,
        };
      },
    );
    const entries = fetched.filter((e): e is CatalogEntry => e !== null);

    this.catalogCache = { data: entries, fetchedAt: Date.now() };
    return entries;
  }

  async fetchTemplate(
    name: string,
  ): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }> {
    // Fetch manifest
    const manifestRes = await this.get(
      this.raw(`templates/${name}/template.yaml`),
    );
    if (!manifestRes.ok) {
      throw new NanohypeError(
        `Template '${name}' not found: ${manifestRes.status}`,
      );
    }
    const manifest = yaml.load(await manifestRes.text()) as TemplateManifest;

    if (manifest.apiVersion !== "nanohype/v1") {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }

    // Fetch skeleton via Git Trees API (recursive, single request)
    const treeRes = await this.get(
      `https://api.github.com/repos/${this.repo}/git/trees/${this.ref}?recursive=1`,
    );
    if (!treeRes.ok)
      throw new NanohypeError(`Failed to fetch repo tree: ${treeRes.status}`);

    const tree = (await treeRes.json()) as {
      tree: { path: string; type: string; sha: string }[];
    };

    const skeletonPrefix = `templates/${name}/skeleton/`;
    const skeletonBlobs = tree.tree.filter(
      (entry) => entry.type === "blob" && entry.path.startsWith(skeletonPrefix),
    );

    // Fetch file contents. Any failure aborts the render — a skeleton with
    // holes is worse than no skeleton.
    const files = await mapConcurrent(
      skeletonBlobs,
      FETCH_CONCURRENCY,
      async (blob) => {
        const fileRes = await this.get(this.raw(blob.path));
        if (!fileRes.ok) {
          throw new NanohypeError(
            `Failed to fetch skeleton file '${blob.path}' for template '${name}': ${fileRes.status}`,
          );
        }
        return {
          path: blob.path.slice(skeletonPrefix.length),
          content: await fileRes.text(),
        } satisfies SkeletonFile;
      },
    );

    return { manifest, files };
  }

  async listComposites(): Promise<CompositeCatalogEntry[]> {
    if (this.isFresh(this.compositeCatalogCache))
      return this.compositeCatalogCache.data;

    const res = await this.get(
      `https://api.github.com/repos/${this.repo}/contents/composites?ref=${this.ref}`,
    );
    if (!res.ok)
      throw new NanohypeError(
        `Failed to list composite catalog: ${res.status}`,
      );

    const items = (await res.json()) as { name: string; type: string }[];
    const yamlFiles = items.filter(
      (f) => f.type === "file" && f.name.endsWith(".yaml"),
    );

    const fetched = await mapConcurrent(
      yamlFiles,
      FETCH_CONCURRENCY,
      async (file): Promise<CompositeCatalogEntry | null> => {
        const manifestRes = await this.get(this.raw(`composites/${file.name}`));
        if (manifestRes.status === 404) return null;
        if (!manifestRes.ok) {
          throw new NanohypeError(
            `Failed to fetch composite manifest '${file.name}': ${manifestRes.status}`,
          );
        }
        let manifest: CompositeManifest;
        try {
          manifest = yaml.load(await manifestRes.text()) as CompositeManifest;
        } catch (err) {
          throw new NanohypeError(
            `Invalid composite manifest '${file.name}': ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (manifest.kind !== "composite") return null;
        return {
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          tags: manifest.tags,
          templateCount: manifest.templates.length,
        };
      },
    );
    const entries = fetched.filter(
      (e): e is CompositeCatalogEntry => e !== null,
    );

    this.compositeCatalogCache = { data: entries, fetchedAt: Date.now() };
    return entries;
  }

  async fetchComposite(name: string): Promise<CompositeManifest> {
    const res = await this.get(this.raw(`composites/${name}.yaml`));
    if (!res.ok)
      throw new NanohypeError(`Composite '${name}' not found: ${res.status}`);
    const manifest = yaml.load(await res.text()) as CompositeManifest;

    if (manifest.apiVersion !== "nanohype/v1") {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }
    if (manifest.kind !== "composite") {
      throw new NanohypeError(
        `Expected kind 'composite', got '${manifest.kind}'`,
      );
    }

    return manifest;
  }

  async fetchCatalogManifest(): Promise<Catalog> {
    const res = await this.get(this.raw("catalog.json"));
    if (!res.ok)
      throw new NanohypeError(`catalog.json not found: ${res.status}`);
    return (await res.json()) as Catalog;
  }

  async fetchStandard(name: StandardName): Promise<Standard> {
    const res = await this.get(this.raw(`standards/${name}.json`));
    if (!res.ok)
      throw new NanohypeError(`Standard '${name}' not found: ${res.status}`);
    return (await res.json()) as Standard;
  }

  async fetchContract(repo: ContractRepo): Promise<string> {
    // The nanohype repo's AGENTS.md lives in `this.repo`; each other repo
    // is a sibling under the same GitHub org (`<org>/<repo>`). When the
    // configured `this.repo` is `<org>/nanohype` we resolve siblings as
    // `<org>/<repo>`. Otherwise we still target the configured ref on the
    // explicit repo path (an MCP server pointed at a fork's `nanohype` will
    // pull contracts from the matching forked siblings, which is correct).
    const [org] = this.repo.split("/");
    const targetRepo = repo === "nanohype" ? this.repo : `${org}/${repo}`;

    // With a token, resolve via the authenticated contents API — it works for
    // both public and private repos (raw.githubusercontent can't authenticate
    // private content via a Bearer header). Without a token, use the raw host,
    // which is fine for public repos.
    if (this.token) {
      const res = await this.get(
        `https://api.github.com/repos/${targetRepo}/contents/AGENTS.md?ref=${this.ref}`,
      );
      if (!res.ok) {
        throw new NanohypeError(
          `AGENTS.md for repo '${repo}' not found: ${res.status}`,
        );
      }
      const body = (await res.json()) as {
        content?: string;
        encoding?: string;
      };
      if (body.encoding === "base64" && body.content) {
        return Buffer.from(body.content, "base64").toString("utf-8");
      }
      throw new NanohypeError(
        `AGENTS.md for repo '${repo}' returned an unexpected encoding`,
      );
    }

    const res = await this.get(
      `https://raw.githubusercontent.com/${targetRepo}/${this.ref}/AGENTS.md`,
    );
    if (!res.ok) {
      throw new NanohypeError(
        `AGENTS.md for repo '${repo}' not found: ${res.status}`,
      );
    }
    return await res.text();
  }
}
