import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
import type { CatalogSource, LocalSourceOptions } from '../source.js';
import { NanohypeError } from '../errors.js';

/**
 * Catalog source that reads templates from a local filesystem directory.
 * Expects the standard nanohype layout: templates/, composites/, schemas/.
 * No caching — filesystem reads are fast and caching causes stale results during development.
 */
export class LocalSource implements CatalogSource {
  private readonly rootDir: string;

  constructor(options: LocalSourceOptions) {
    this.rootDir = options.rootDir;
  }

  /**
   * Resolve caller-influenced path segments against a base directory and
   * assert the result stays inside it. Names ultimately arrive from LLM
   * tool arguments, so a crafted `../`, absolute, or null-byte segment
   * must never resolve to a file outside the catalog tree.
   */
  private resolveWithin(baseDir: string, ...segments: string[]): string {
    for (const segment of segments) {
      if (segment.includes('\0')) {
        throw new NanohypeError(`Invalid path segment: contains a null byte`);
      }
    }
    const base = resolve(baseDir);
    const resolved = resolve(base, ...segments);
    if (resolved !== base && !resolved.startsWith(base + sep)) {
      throw new NanohypeError(`Path '${segments.join('/')}' escapes '${base}'`);
    }
    return resolved;
  }

  async listTemplates(): Promise<CatalogEntry[]> {
    const templatesDir = join(this.rootDir, 'templates');
    let dirs: string[];
    try {
      dirs = await readdir(templatesDir);
    } catch {
      return [];
    }

    const entries: CatalogEntry[] = [];
    for (const dir of dirs) {
      try {
        const manifestPath = join(templatesDir, dir, 'template.yaml');
        const manifestText = await readFile(manifestPath, 'utf-8');
        const manifest = yaml.load(manifestText) as TemplateManifest;
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
        // Skip directories without valid manifests
      }
    }

    return entries;
  }

  async fetchTemplate(
    name: string,
  ): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }> {
    const templateDir = this.resolveWithin(join(this.rootDir, 'templates'), name);
    const manifestPath = join(templateDir, 'template.yaml');

    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, 'utf-8');
    } catch {
      throw new NanohypeError(`Template '${name}' not found at ${manifestPath}`);
    }

    const manifest = yaml.load(manifestText) as TemplateManifest;
    if (manifest.apiVersion !== 'nanohype/v1') {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }

    const skeletonDir = join(templateDir, 'skeleton');
    const files = await this.walkDir(skeletonDir, skeletonDir);

    return { manifest, files };
  }

  async listComposites(): Promise<CompositeCatalogEntry[]> {
    const compositesDir = join(this.rootDir, 'composites');
    let items: string[];
    try {
      items = await readdir(compositesDir);
    } catch {
      return [];
    }

    const entries: CompositeCatalogEntry[] = [];
    for (const item of items) {
      if (!item.endsWith('.yaml')) continue;
      try {
        const text = await readFile(join(compositesDir, item), 'utf-8');
        const manifest = yaml.load(text) as CompositeManifest;
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
        // Skip invalid composites
      }
    }

    return entries;
  }

  async fetchComposite(name: string): Promise<CompositeManifest> {
    const compositePath = this.resolveWithin(join(this.rootDir, 'composites'), `${name}.yaml`);

    let text: string;
    try {
      text = await readFile(compositePath, 'utf-8');
    } catch {
      throw new NanohypeError(`Composite '${name}' not found at ${compositePath}`);
    }

    const manifest = yaml.load(text) as CompositeManifest;
    if (manifest.apiVersion !== 'nanohype/v1') {
      throw new NanohypeError(`Unsupported apiVersion: ${manifest.apiVersion}`);
    }
    if (manifest.kind !== 'composite') {
      throw new NanohypeError(`Expected kind 'composite', got '${manifest.kind}'`);
    }

    return manifest;
  }

  async fetchCatalogManifest(): Promise<Catalog> {
    const path = join(this.rootDir, 'catalog.json');
    let text: string;
    try {
      text = await readFile(path, 'utf-8');
    } catch {
      throw new NanohypeError(`catalog.json not found at ${path}`);
    }
    return JSON.parse(text) as Catalog;
  }

  async fetchStandard(name: StandardName): Promise<Standard> {
    const path = this.resolveWithin(join(this.rootDir, 'standards'), `${name}.json`);
    let text: string;
    try {
      text = await readFile(path, 'utf-8');
    } catch {
      throw new NanohypeError(`Standard '${name}' not found at ${path}`);
    }
    return JSON.parse(text) as Standard;
  }

  async fetchContract(repo: ContractRepo): Promise<string> {
    // `rootDir` points at the nanohype repo; sibling repos live alongside it
    // in the same parent (the local workspace mirrors the github org layout).
    // For the `nanohype` repo itself the AGENTS.md is at rootDir/AGENTS.md;
    // for the others it's at ../<repo>/AGENTS.md — contained to the workspace
    // parent so a crafted `repo` can't walk to arbitrary AGENTS.md files.
    const path =
      repo === 'nanohype'
        ? join(this.rootDir, 'AGENTS.md')
        : this.resolveWithin(dirname(resolve(this.rootDir)), repo, 'AGENTS.md');
    try {
      return await readFile(path, 'utf-8');
    } catch {
      throw new NanohypeError(`AGENTS.md for repo '${repo}' not found at ${path}`);
    }
  }

  /**
   * Recursively walk a skeleton directory and return flat {@link SkeletonFile}
   * records. `baseDir` is threaded through every recursion so that every
   * emitted `path` is computed relative to the skeleton root rather than the
   * immediate parent — otherwise nested files (e.g. `src/oauth/index.ts`)
   * would collapse to just their basename and the output tree would be flat.
   */
  private async walkDir(dir: string, baseDir: string): Promise<SkeletonFile[]> {
    const files: SkeletonFile[] = [];

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return files;
    }

    const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'coverage']);

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        const nested = await this.walkDir(fullPath, baseDir);
        files.push(...nested);
      } else {
        files.push({
          path: relative(baseDir, fullPath),
          content: await readFile(fullPath, 'utf-8'),
        });
      }
    }

    return files;
  }
}
