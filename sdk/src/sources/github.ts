import yaml from 'js-yaml';
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
} from '../types.js';
import type { CatalogSource, GitHubSourceOptions } from '../source.js';
import { NanohypeError } from '../errors.js';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/**
 * Catalog source that reads templates from a GitHub repository via the GitHub API.
 * Uses native fetch and in-memory TTL caching per instance.
 */
export class GitHubSource implements CatalogSource {
  private readonly repo: string;
  private readonly ref: string;
  private readonly token?: string;
  private readonly cacheTtl: number;

  private catalogCache: CacheEntry<CatalogEntry[]> | null = null;
  private compositeCatalogCache: CacheEntry<CompositeCatalogEntry[]> | null = null;

  constructor(options: GitHubSourceOptions = {}) {
    this.repo = options.repo ?? 'nanohype/nanohype';
    this.ref = options.ref ?? 'main';
    // Fall back to GITHUB_TOKEN so a private contract repo resolves with no caller
    // config when the env var is present.
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.cacheTtl = options.cacheTtl ?? 5 * 60 * 1000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private isFresh<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
    return cache !== null && Date.now() - cache.fetchedAt < this.cacheTtl;
  }

  async listTemplates(): Promise<CatalogEntry[]> {
    if (this.isFresh(this.catalogCache)) return this.catalogCache.data;

    const res = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/templates?ref=${this.ref}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new NanohypeError(`Failed to list catalog: ${res.status}`);

    const dirs = (await res.json()) as { name: string; type: string }[];
    const templateDirs = dirs.filter((d) => d.type === 'dir');

    const entries: CatalogEntry[] = [];
    for (const dir of templateDirs) {
      try {
        const manifestRes = await fetch(
          `https://raw.githubusercontent.com/${this.repo}/${this.ref}/templates/${dir.name}/template.yaml`,
          { headers: this.headers() },
        );
        if (!manifestRes.ok) continue;
        const manifest = yaml.load(await manifestRes.text()) as TemplateManifest;
        entries.push({
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          kind: manifest.kind,
          persona: manifest.persona,
          category: manifest.category,
          tags: manifest.tags,
        });
      } catch {
        // Skip templates with invalid manifests
      }
    }

    this.catalogCache = { data: entries, fetchedAt: Date.now() };
    return entries;
  }

  async fetchTemplate(
    name: string,
  ): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }> {
    // Fetch manifest
    const manifestRes = await fetch(
      `https://raw.githubusercontent.com/${this.repo}/${this.ref}/templates/${name}/template.yaml`,
      { headers: this.headers() },
    );
    if (!manifestRes.ok) {
      throw new NanohypeError(`Template '${name}' not found: ${manifestRes.status}`);
    }
    const manifest = yaml.load(await manifestRes.text()) as TemplateManifest;

    if (manifest.apiVersion !== 'nanohype/v1') {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }

    // Fetch skeleton via Git Trees API (recursive, single request)
    const treeRes = await fetch(
      `https://api.github.com/repos/${this.repo}/git/trees/${this.ref}?recursive=1`,
      { headers: this.headers() },
    );
    if (!treeRes.ok) throw new NanohypeError(`Failed to fetch repo tree: ${treeRes.status}`);

    const tree = (await treeRes.json()) as {
      tree: { path: string; type: string; sha: string }[];
    };

    const skeletonPrefix = `templates/${name}/skeleton/`;
    const skeletonBlobs = tree.tree.filter(
      (entry) => entry.type === 'blob' && entry.path.startsWith(skeletonPrefix),
    );

    // Fetch file contents
    const files: SkeletonFile[] = [];
    for (const blob of skeletonBlobs) {
      const fileRes = await fetch(
        `https://raw.githubusercontent.com/${this.repo}/${this.ref}/${blob.path}`,
        { headers: this.headers() },
      );
      if (!fileRes.ok) continue;
      files.push({
        path: blob.path.slice(skeletonPrefix.length),
        content: await fileRes.text(),
      });
    }

    return { manifest, files };
  }

  async listComposites(): Promise<CompositeCatalogEntry[]> {
    if (this.isFresh(this.compositeCatalogCache)) return this.compositeCatalogCache.data;

    const res = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/composites?ref=${this.ref}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new NanohypeError(`Failed to list composite catalog: ${res.status}`);

    const items = (await res.json()) as { name: string; type: string }[];
    const yamlFiles = items.filter((f) => f.type === 'file' && f.name.endsWith('.yaml'));

    const entries: CompositeCatalogEntry[] = [];
    for (const file of yamlFiles) {
      try {
        const manifestRes = await fetch(
          `https://raw.githubusercontent.com/${this.repo}/${this.ref}/composites/${file.name}`,
          { headers: this.headers() },
        );
        if (!manifestRes.ok) continue;
        const manifest = yaml.load(await manifestRes.text()) as CompositeManifest;
        if (manifest.kind !== 'composite') continue;
        entries.push({
          name: manifest.name,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          tags: manifest.tags,
          templateCount: manifest.templates.length,
        });
      } catch {
        // Skip composites with invalid manifests
      }
    }

    this.compositeCatalogCache = { data: entries, fetchedAt: Date.now() };
    return entries;
  }

  async fetchComposite(name: string): Promise<CompositeManifest> {
    const res = await fetch(
      `https://raw.githubusercontent.com/${this.repo}/${this.ref}/composites/${name}.yaml`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new NanohypeError(`Composite '${name}' not found: ${res.status}`);
    const manifest = yaml.load(await res.text()) as CompositeManifest;

    if (manifest.apiVersion !== 'nanohype/v1') {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }
    if (manifest.kind !== 'composite') {
      throw new NanohypeError(`Expected kind 'composite', got '${manifest.kind}'`);
    }

    return manifest;
  }

  async fetchCatalogManifest(): Promise<Catalog> {
    const res = await fetch(
      `https://raw.githubusercontent.com/${this.repo}/${this.ref}/catalog.json`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new NanohypeError(`catalog.json not found: ${res.status}`);
    return (await res.json()) as Catalog;
  }

  async fetchStandard(name: StandardName): Promise<Standard> {
    const res = await fetch(
      `https://raw.githubusercontent.com/${this.repo}/${this.ref}/standards/${name}.json`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new NanohypeError(`Standard '${name}' not found: ${res.status}`);
    return (await res.json()) as Standard;
  }

  async fetchContract(repo: ContractRepo): Promise<string> {
    // The nanohype repo's AGENTS.md lives in `this.repo`; each other repo
    // is a sibling under the same GitHub org (`<org>/<repo>`). When the
    // configured `this.repo` is `<org>/nanohype` we resolve siblings as
    // `<org>/<repo>`. Otherwise we still target the configured ref on the
    // explicit repo path (an MCP server pointed at a fork's `nanohype` will
    // pull contracts from the matching forked siblings, which is correct).
    const [org] = this.repo.split('/');
    const targetRepo = repo === 'nanohype' ? this.repo : `${org}/${repo}`;

    // With a token, resolve via the authenticated contents API — it works for
    // both public and private repos (raw.githubusercontent can't authenticate
    // private content via a Bearer header). Without a token, use the raw host,
    // which is fine for public repos.
    if (this.token) {
      const res = await fetch(
        `https://api.github.com/repos/${targetRepo}/contents/AGENTS.md?ref=${this.ref}`,
        { headers: this.headers() },
      );
      if (!res.ok) {
        throw new NanohypeError(`AGENTS.md for repo '${repo}' not found: ${res.status}`);
      }
      const body = (await res.json()) as { content?: string; encoding?: string };
      if (body.encoding === 'base64' && body.content) {
        return Buffer.from(body.content, 'base64').toString('utf-8');
      }
      throw new NanohypeError(`AGENTS.md for repo '${repo}' returned an unexpected encoding`);
    }

    const res = await fetch(
      `https://raw.githubusercontent.com/${targetRepo}/${this.ref}/AGENTS.md`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new NanohypeError(`AGENTS.md for repo '${repo}' not found: ${res.status}`);
    }
    return await res.text();
  }
}
