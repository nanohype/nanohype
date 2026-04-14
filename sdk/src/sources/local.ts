import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import type {
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  SkeletonFile,
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
    const templateDir = join(this.rootDir, 'templates', name);
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
    const compositePath = join(this.rootDir, 'composites', `${name}.yaml`);

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
