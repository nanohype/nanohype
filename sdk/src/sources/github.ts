import * as yaml from "js-yaml";
import { isContractRepo } from "../contracts.js";
import { NanohypeError } from "../errors.js";
import type { CatalogSource, GitHubSourceOptions } from "../source.js";
import { isStandardName } from "../standards.js";
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
import { isCatalogName } from "../validator.js";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

// A single timeout is enough to fail a whole scaffold, and the failure is
// usually the network rather than the repo — raw.githubusercontent.com dropping
// one request out of a few hundred is routine. Three attempts turns that from a
// hard failure into a pause.
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 250;
// Ceiling on backoff we invent ourselves. Low, because these are our own
// retries and a scaffold should not stall on them.
const MAX_BACKOFF_MS = 5_000;
// Retry-After gets its own, much larger ceiling. GitHub's secondary rate limit
// sends tens of seconds, so clamping it to MAX_BACKOFF_MS would retry *before*
// the window elapsed — spending the attempt budget on requests the server has
// already refused, and extending the limit that caused it. Past this ceiling
// waiting is worse than failing, so get() stops retrying rather than retrying
// early: a caller who wants to wait two minutes can do it with better context
// than this layer has.
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Whether a response status is worth another attempt. 429 and 5xx are the
 * server saying "later"; every other status is an answer. 404 in particular
 * must fall through — listCatalog reads it as "this directory is not a
 * template", so retrying it would turn a control-flow signal into three
 * requests and a delay.
 */
const isTransient = (status: number): boolean => status === 429 || status >= 500;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Exponential backoff with full jitter (AWS's "Exponential Backoff and Jitter").
 * Jitter is not decoration: a scaffold fans out FETCH_CONCURRENCY requests at
 * once, so an undithered delay would retry all of them on the same tick and
 * rebuild the burst that triggered the rate limit.
 */
function backoffMs(attempt: number, res?: Response): number {
  const explicit = res ? retryAfterMs(res) : 0;
  if (explicit) return explicit;
  const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.random() * ceiling;
}

/**
 * The server's own Retry-After in milliseconds, or 0 when absent or
 * unparseable. GitHub sends seconds; the HTTP-date form parses as NaN and falls
 * through to jittered backoff, which is the right default for a header we
 * cannot read.
 */
function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

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
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
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
  private readonly maxAttempts: number;

  private catalogCache: CacheEntry<CatalogEntry[]> | null = null;
  private compositeCatalogCache: CacheEntry<CompositeCatalogEntry[]> | null = null;

  constructor(options: GitHubSourceOptions = {}) {
    this.repo = options.repo ?? "nanohype/nanohype";
    this.ref = options.ref ?? "main";
    // Fall back to GITHUB_TOKEN so a private contract repo resolves with no caller
    // config when the env var is present.
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.cacheTtl = options.cacheTtl ?? 5 * 60 * 1000;
    this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /**
   * One attempt. A fresh AbortSignal per call — a timeout signal is consumed
   * once, so reusing it across retries would abort every attempt after the
   * first instantly.
   */
  private async attempt(url: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.requestTimeout),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new NanohypeError(`GitHub request timed out after ${this.requestTimeout}ms: ${url}`);
      }
      throw err;
    }
  }

  private async get(url: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let res: Response | undefined;
      try {
        res = await this.attempt(url);
      } catch (err) {
        lastError = err;
      }

      if (res && !isTransient(res.status)) return res;
      if (attempt === this.maxAttempts) {
        if (res) return res; // out of attempts — hand the caller the real status
        throw lastError;
      }
      // The server asked for longer than we will hold a scaffold. Retrying
      // inside its window is guaranteed to be refused, so surface the response
      // now rather than burn the remaining attempts proving that.
      if (res && retryAfterMs(res) > MAX_RETRY_AFTER_MS) return res;

      await sleep(backoffMs(attempt, res));
    }

    /* c8 ignore next -- the loop either returns or throws on its last attempt */
    throw lastError;
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
    if (!res.ok) throw new NanohypeError(`Failed to list catalog: ${res.status}`);

    const dirs = (await res.json()) as { name: string; type: string }[];
    const templateDirs = dirs.filter((d) => d.type === "dir");

    const fetched = await mapConcurrent(
      templateDirs,
      FETCH_CONCURRENCY,
      async (dir): Promise<CatalogEntry | null> => {
        const manifestRes = await this.get(this.raw(`templates/${dir.name}/template.yaml`));
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
    // `name` is interpolated into request paths — reject anything that isn't
    // a well-formed catalog name before it can reshape the URL.
    if (!isCatalogName(name)) {
      throw new NanohypeError(`Invalid template name: ${JSON.stringify(name)}`);
    }

    // Fetch manifest
    const manifestRes = await this.get(this.raw(`templates/${name}/template.yaml`));
    if (!manifestRes.ok) {
      throw new NanohypeError(`Template '${name}' not found: ${manifestRes.status}`);
    }
    const manifest = yaml.load(await manifestRes.text()) as TemplateManifest;

    if (manifest.apiVersion !== "nanohype/v1") {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }

    // Fetch skeleton via Git Trees API (recursive, single request)
    const treeRes = await this.get(
      `https://api.github.com/repos/${this.repo}/git/trees/${this.ref}?recursive=1`,
    );
    if (!treeRes.ok) throw new NanohypeError(`Failed to fetch repo tree: ${treeRes.status}`);

    const tree = (await treeRes.json()) as {
      tree: { path: string; type: string; sha: string }[];
    };

    const skeletonPrefix = `templates/${name}/skeleton/`;
    const skeletonBlobs = tree.tree.filter(
      (entry) => entry.type === "blob" && entry.path.startsWith(skeletonPrefix),
    );

    // Fetch file contents. Any failure aborts the render — a skeleton with
    // holes is worse than no skeleton.
    const files = await mapConcurrent(skeletonBlobs, FETCH_CONCURRENCY, async (blob) => {
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
    });

    return { manifest, files };
  }

  async listComposites(): Promise<CompositeCatalogEntry[]> {
    if (this.isFresh(this.compositeCatalogCache)) return this.compositeCatalogCache.data;

    const res = await this.get(
      `https://api.github.com/repos/${this.repo}/contents/composites?ref=${this.ref}`,
    );
    if (!res.ok) throw new NanohypeError(`Failed to list composite catalog: ${res.status}`);

    const items = (await res.json()) as { name: string; type: string }[];
    const yamlFiles = items.filter((f) => f.type === "file" && f.name.endsWith(".yaml"));

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
    const entries = fetched.filter((e): e is CompositeCatalogEntry => e !== null);

    this.compositeCatalogCache = { data: entries, fetchedAt: Date.now() };
    return entries;
  }

  async fetchComposite(name: string): Promise<CompositeManifest> {
    if (!isCatalogName(name)) {
      throw new NanohypeError(`Invalid composite name: ${JSON.stringify(name)}`);
    }
    const res = await this.get(this.raw(`composites/${name}.yaml`));
    if (!res.ok) throw new NanohypeError(`Composite '${name}' not found: ${res.status}`);
    const manifest = yaml.load(await res.text()) as CompositeManifest;

    if (manifest.apiVersion !== "nanohype/v1") {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }
    if (manifest.kind !== "composite") {
      throw new NanohypeError(`Expected kind 'composite', got '${manifest.kind}'`);
    }

    return manifest;
  }

  async fetchCatalogManifest(): Promise<Catalog> {
    const res = await this.get(this.raw("catalog.json"));
    if (!res.ok) throw new NanohypeError(`catalog.json not found: ${res.status}`);
    return (await res.json()) as Catalog;
  }

  async fetchStandard(name: StandardName): Promise<Standard> {
    // Typed as StandardName, but callers cast LLM-supplied strings — hold the line at runtime.
    if (!isStandardName(name)) {
      throw new NanohypeError(`Unknown standard: ${JSON.stringify(name)}`);
    }
    const res = await this.get(this.raw(`standards/${name}.json`));
    if (!res.ok) throw new NanohypeError(`Standard '${name}' not found: ${res.status}`);
    return (await res.json()) as Standard;
  }

  async fetchContract(repo: ContractRepo): Promise<string> {
    // Typed as ContractRepo, but callers cast LLM-supplied strings — a raw
    // value like `x/main/evil?` would otherwise reshape the request path.
    if (!isContractRepo(repo)) {
      throw new NanohypeError(`Unknown contract repo: ${JSON.stringify(repo)}`);
    }

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
        throw new NanohypeError(`AGENTS.md for repo '${repo}' not found: ${res.status}`);
      }
      const body = (await res.json()) as {
        content?: string;
        encoding?: string;
      };
      if (body.encoding === "base64" && body.content) {
        return Buffer.from(body.content, "base64").toString("utf-8");
      }
      throw new NanohypeError(`AGENTS.md for repo '${repo}' returned an unexpected encoding`);
    }

    const res = await this.get(
      `https://raw.githubusercontent.com/${targetRepo}/${this.ref}/AGENTS.md`,
    );
    if (!res.ok) {
      throw new NanohypeError(`AGENTS.md for repo '${repo}' not found: ${res.status}`);
    }
    return await res.text();
  }
}
